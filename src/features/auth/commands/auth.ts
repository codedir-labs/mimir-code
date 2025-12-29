/**
 * Teams authentication commands
 *
 * Commands:
 * - mimir auth login - Authenticate with Teams via device flow
 * - mimir auth logout - Sign out
 * - mimir auth status - Show authentication status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { TeamsAuthManager } from '../manager/TeamsAuthManager.js';
import { logger } from '@/shared/utils/logger.js';

// Global auth manager instance
const authManager = new TeamsAuthManager();

/**
 * Display device code for user authentication
 */
function displayDeviceCode(
  userCode: string,
  verificationUri: string,
  verificationUriComplete: string
): void {
  console.log();
  console.log(
    boxen(
      chalk.bold('Authenticate with Mimir Teams\n\n') +
        chalk.white('1. Visit: ') +
        chalk.cyan.underline(verificationUri) +
        '\n' +
        chalk.white('2. Enter code: ') +
        chalk.bold.yellow(userCode) +
        '\n\n' +
        chalk.dim('Or visit this URL to auto-fill the code:') +
        '\n' +
        chalk.dim.cyan(verificationUriComplete),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );
  console.log();
}

/**
 * Create auth command
 */
export function createAuthCommand(): Command {
  const auth = new Command('auth').description('Teams authentication management');

  // mimir auth login
  auth
    .command('login')
    .description('Authenticate with Mimir Teams (OAuth 2.0 Device Flow)')
    .option('--org <slug>', 'Specific organization to login to')
    .action(async (options) => {
      const spinner = ora('Requesting device code...').start();

      try {
        await authManager.deviceFlowLogin({
          orgSlug: options.org,
          onDeviceCode: (userCode, verificationUri, verificationUriComplete) => {
            spinner.stop();
            displayDeviceCode(userCode, verificationUri, verificationUriComplete);
            spinner.start('Waiting for authorization...');
          },
          pollInterval: 5, // Poll every 5 seconds
          timeout: 900, // 15 minutes
        });

        spinner.succeed(chalk.green('Authentication successful!'));

        // Show authenticated organization
        const activeOrg = await authManager.getActiveOrg();
        if (activeOrg) {
          console.log(chalk.white('\n✓ Active organization: ') + chalk.cyan(activeOrg));
        }

        const orgs = await authManager.listOrgs();
        if (orgs.length > 1) {
          console.log(
            chalk.dim(
              `\nℹ  You are a member of ${orgs.length} organizations. Use ${chalk.cyan('mimir orgs list')} to see all.`
            )
          );
        }

        console.log();
      } catch (error) {
        spinner.fail(chalk.red('Authentication failed'));
        console.error(
          chalk.red('\nError: ') + (error instanceof Error ? error.message : 'Unknown error')
        );
        logger.error('[Auth] Login failed', { error });
        process.exit(1);
      }
    });

  // mimir auth logout
  auth
    .command('logout')
    .description('Sign out from Teams')
    .option('--org <slug>', 'Specific organization to logout from')
    .option('--all', 'Logout from all organizations')
    .action(async (options) => {
      const spinner = ora('Logging out...').start();

      try {
        await authManager.logout(options.org, options.all);

        if (options.all) {
          spinner.succeed(chalk.green('Logged out from all organizations'));
        } else {
          const orgSlug = options.org || (await authManager.getActiveOrg());
          spinner.succeed(
            chalk.green(`Logged out from organization: ${chalk.cyan(orgSlug || 'unknown')}`)
          );
        }

        console.log();
      } catch (error) {
        spinner.fail(chalk.red('Logout failed'));
        console.error(
          chalk.red('\nError: ') + (error instanceof Error ? error.message : 'Unknown error')
        );
        logger.error('[Auth] Logout failed', { error });
        process.exit(1);
      }
    });

  // mimir auth status
  auth
    .command('status')
    .description('Show authentication status')
    .action(async () => {
      try {
        const activeOrg = await authManager.getActiveOrg();
        const orgs = await authManager.listOrgs();
        const isAuthenticated = await authManager.isAuthenticated();

        console.log(chalk.blue('\n📊 Authentication Status\n'));
        console.log(chalk.dim('─'.repeat(60)));

        if (isAuthenticated) {
          console.log(chalk.white('  Mode:            ') + chalk.green('Teams'));
          console.log(chalk.white('  Authenticated:   ') + chalk.green('Yes'));
          console.log(chalk.white('  Active Org:      ') + chalk.cyan(activeOrg || 'None'));

          if (activeOrg) {
            const auth = await authManager.getAuth(activeOrg);
            if (auth) {
              console.log(chalk.white('  User Email:      ') + chalk.white(auth.userEmail));
              console.log(
                chalk.white('  Token Expires:   ') + chalk.white(auth.expiresAt.toLocaleString())
              );
            }
          }

          console.log(chalk.white('  Organizations:   ') + chalk.white(orgs.length.toString()));

          if (orgs.length > 0) {
            console.log(chalk.dim('\n  Authenticated Organizations:'));
            for (const orgSlug of orgs) {
              const isActive = orgSlug === activeOrg;
              const prefix = isActive ? chalk.green('  ● ') : chalk.dim('  ○ ');
              console.log(
                prefix + chalk.white(orgSlug) + (isActive ? chalk.green(' (active)') : '')
              );
            }
          }
        } else {
          console.log(chalk.white('  Mode:            ') + chalk.yellow('Local (BYOK)'));
          console.log(chalk.white('  Authenticated:   ') + chalk.red('No'));
          console.log(chalk.white('  Organization:    ') + chalk.dim('N/A'));
          console.log(chalk.white('  Team:            ') + chalk.dim('N/A'));

          console.log(chalk.dim('\n  Not authenticated to Teams.'));
          console.log(chalk.dim(`  Use ${chalk.cyan('mimir auth login')} to authenticate.`));
        }

        console.log(chalk.dim('─'.repeat(60)));
        console.log();
      } catch (error) {
        console.error(
          chalk.red('\nError: ') + (error instanceof Error ? error.message : 'Unknown error')
        );
        logger.error('[Auth] Status check failed', { error });
        process.exit(1);
      }
    });

  return auth;
}
