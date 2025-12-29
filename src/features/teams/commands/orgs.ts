/**
 * Teams organization commands
 *
 * Commands:
 * - mimir orgs list - List organizations
 * - mimir orgs set <slug> - Set active organization
 * - mimir orgs current - Show current organization
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { TeamsAuthManager } from '@/features/auth/manager/TeamsAuthManager.js';
import { TeamsAPIClient } from '../api/TeamsAPIClient.js';
import { logger } from '@/shared/utils/logger.js';

// Global auth manager instance
const authManager = new TeamsAuthManager();

export function createOrgsCommand(): Command {
  const orgs = new Command('orgs').description('Organization management');

  // mimir orgs list
  orgs
    .command('list')
    .description('List your organizations')
    .action(async () => {
      const spinner = ora('Loading organizations...').start();

      try {
        // Check if authenticated
        const isAuthenticated = await authManager.isAuthenticated();

        if (!isAuthenticated) {
          spinner.stop();
          console.log(chalk.yellow('\n⚠ Not authenticated'));
          console.log(chalk.dim('You are currently in local mode (not authenticated to Teams).'));
          console.log(chalk.dim(`Run ${chalk.cyan('mimir auth login')} to authenticate.\n`));
          return;
        }

        // Get organizations from storage
        const orgSlugs = await authManager.listOrgs();
        const activeOrg = await authManager.getActiveOrg();

        spinner.stop();

        if (orgSlugs.length === 0) {
          console.log(chalk.yellow('\n⚠ No organizations found'));
          console.log(chalk.dim('You are not a member of any organizations.\n'));
          return;
        }

        console.log(chalk.blue(`\n📋 Your Organizations (${orgSlugs.length})\n`));
        console.log(chalk.dim('─'.repeat(70)));

        // Get detailed info for each org
        for (const orgSlug of orgSlugs) {
          const auth = await authManager.getAuth(orgSlug);
          const isActive = orgSlug === activeOrg;

          if (auth) {
            const prefix = isActive ? chalk.green('●') : chalk.dim('○');
            const statusBadge = isActive ? chalk.green.bold(' [ACTIVE]') : '';

            console.log(`  ${prefix} ${chalk.bold.white(orgSlug)}${statusBadge}`);
            console.log(
              `    ${chalk.dim('Email:')} ${chalk.white(auth.userEmail)}  ${chalk.dim('|')}  ` +
                `${chalk.dim('Expires:')} ${chalk.white(auth.expiresAt.toLocaleString())}`
            );
          } else {
            const prefix = isActive ? chalk.green('●') : chalk.dim('○');
            console.log(`  ${prefix} ${chalk.white(orgSlug)}`);
          }
        }

        console.log(chalk.dim('─'.repeat(70)));
        console.log(
          chalk.dim(`\nℹ  Use ${chalk.cyan('mimir orgs set <slug>')} to switch organizations\n`)
        );
      } catch (error) {
        spinner.fail(chalk.red('Failed to list organizations'));
        console.error(
          chalk.red('\nError: ') + (error instanceof Error ? error.message : 'Unknown error')
        );
        logger.error('[Orgs] List failed', { error });
        process.exit(1);
      }
    });

  // mimir orgs set <slug>
  orgs
    .command('set <slug>')
    .description('Set active organization')
    .action(async (slug: string) => {
      const spinner = ora(`Setting active organization to ${chalk.cyan(slug)}...`).start();

      try {
        // Check if authenticated
        const isAuthenticated = await authManager.isAuthenticated();

        if (!isAuthenticated) {
          spinner.stop();
          console.log(chalk.yellow('\n⚠ Not authenticated'));
          console.log(chalk.dim(`Run ${chalk.cyan('mimir auth login')} to authenticate first.\n`));
          return;
        }

        // Set active org (will auto-authorize if not already authenticated to this org)
        await authManager.setActiveOrg(slug);

        spinner.succeed(chalk.green(`Active organization set to ${chalk.cyan(slug)}`));
        console.log();
      } catch (error) {
        spinner.fail(chalk.red('Failed to set active organization'));
        console.error(
          chalk.red('\nError: ') + (error instanceof Error ? error.message : 'Unknown error')
        );
        logger.error('[Orgs] Set failed', { slug, error });
        process.exit(1);
      }
    });

  // mimir orgs current
  orgs
    .command('current')
    .description('Show current organization')
    .action(async () => {
      try {
        const activeOrg = await authManager.getActiveOrg();

        if (!activeOrg) {
          console.log(chalk.blue('\n📊 Current Organization\n'));
          console.log(chalk.dim('─'.repeat(60)));
          console.log(chalk.white('  Organization:    ') + chalk.dim('Not authenticated'));
          console.log(chalk.white('  Slug:            ') + chalk.dim('N/A'));
          console.log(chalk.white('  Role:            ') + chalk.dim('N/A'));
          console.log(chalk.dim('─'.repeat(60)));
          console.log(chalk.dim(`\nℹ  Run ${chalk.cyan('mimir auth login')} to authenticate\n`));
          return;
        }

        const auth = await authManager.getAuth(activeOrg);

        console.log(chalk.blue('\n📊 Current Organization\n'));
        console.log(chalk.dim('─'.repeat(60)));

        if (auth) {
          console.log(chalk.white('  Organization:    ') + chalk.cyan(activeOrg));
          console.log(chalk.white('  User Email:      ') + chalk.white(auth.userEmail));
          console.log(
            chalk.white('  Token Expires:   ') + chalk.white(auth.expiresAt.toLocaleString())
          );

          // Check if SSO
          const orgs = await authManager.listOrgs();
          if (orgs.length > 1) {
            console.log(
              chalk.white('  Other Orgs:      ') +
                chalk.dim(orgs.filter((slug) => slug !== activeOrg).join(', '))
            );
          }
        } else {
          console.log(chalk.white('  Organization:    ') + chalk.cyan(activeOrg));
          console.log(chalk.white('  Status:          ') + chalk.yellow('Token expired'));
        }

        console.log(chalk.dim('─'.repeat(60)));
        console.log();
      } catch (error) {
        console.error(
          chalk.red('\nError: ') + (error instanceof Error ? error.message : 'Unknown error')
        );
        logger.error('[Orgs] Current failed', { error });
        process.exit(1);
      }
    });

  return orgs;
}
