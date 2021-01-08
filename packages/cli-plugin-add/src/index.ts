import { BasePlugin } from '@midwayjs/command-core';
import * as enquirer from 'enquirer';
import { join, relative } from 'path';
import { existsSync, remove, readJSONSync } from 'fs-extra';
import * as chalk from 'chalk';
import { exec } from 'child_process';
import { LightGenerator } from 'light-generator';
import Spin from 'light-spinner';
export class AddPlugin extends BasePlugin {
  private projectName = '';
  private projectDirPath = '';
  private template = '';
  private checkDepInstallTimeout;
  commands = {
    new: {
      // mw new xxx -t
      lifecycleEvents: [
        'formatCommand',
        'generator',
        'installDep',
        'printUsage',
      ],
      options: {
        template: {
          usage: 'new template',
          alias: 't',
        },
      },
      passingCommand: true,
    },
  };

  hooks = {
    'new:formatCommand': this.newFormatCommand.bind(this),
    'new:generator': this.generator.bind(this),
    'new:installDep': this.installDep.bind(this),
    'new:printUsage': this.printUsage.bind(this),
  };

  async newFormatCommand() {
    const { commands } = this.core.coreOptions;
    let projectPath = commands[1];
    if (!projectPath) {
      projectPath = await new (enquirer as any).Input({
        message: 'What name would you like to use for the new project?',
        initial: 'midway-project',
      }).run();
    }
    this.projectName = projectPath;
    const { cwd } = this.core;
    this.core.debug('cwd', cwd);
    const projectDirPath = join(cwd, projectPath);
    if (existsSync(projectDirPath)) {
      const isOverwritten = await new (enquirer as any).Confirm({
        name: 'question',
        message: `The name '${projectPath}' already exists, is it overwritten?`,
        initial: true,
      }).run();
      if (!isOverwritten) {
        process.exit();
      }
      await remove(projectDirPath);
    }
    this.projectDirPath = projectDirPath;
    this.template =
      this.options.template || '@midwayjs-examples/applicaiton-web';
  }

  private async generator() {
    const { projectDirPath, template } = this;
    if (!template) {
      return;
    }
    let type = 'npm';
    if (template[0] === '.' || template[0] === '/') {
      type = 'local';
    }
    this.core.debug('template', template);
    this.core.debug('projectDirPath', projectDirPath);
    this.core.debug('type', type);
    const lightGenerator = new LightGenerator();
    let generator;
    if (type === 'npm') {
      // 利用 npm 包
      generator = lightGenerator.defineNpmPackage({
        npmClient: this.options.npm || 'npm',
        npmPackage: template,
        targetPath: projectDirPath,
      });
    } else {
      // 利用本地路径
      generator = lightGenerator.defineLocalPath({
        templatePath: template,
        targetPath: projectDirPath,
      });
    }
    await generator.run();
  }

  private async installDep() {
    await this.npmInstall(this.projectDirPath);
  }

  // 安装npm到构建文件夹
  private async npmInstall(baseDir) {
    return new Promise((resolve, reject) => {
      const installDirectory = baseDir;
      const pkgJson: string = join(installDirectory, 'package.json');
      if (!existsSync(pkgJson)) {
        return resolve(void 0);
      }
      const pkg = readJSONSync(pkgJson);
      const allDeps = Object.keys(
        Object.assign({}, pkg.devDependencies, pkg.dependencies)
      );
      const spin = new Spin({
        text: 'Denpendecies installing...',
      });
      spin.start();
      this.checkDepInstalled(baseDir, spin, allDeps);
      exec(
        `${this.options.npm || 'npm'} install`,
        { cwd: installDirectory },
        err => {
          if (err) {
            const errmsg = (err && err.message) || err;
            this.core.cli.log(` - npm install err ${errmsg}`);
            clearTimeout(this.checkDepInstallTimeout);
            spin.stop();
            reject(errmsg);
          } else {
            clearTimeout(this.checkDepInstallTimeout);
            spin.stop();
            resolve(true);
          }
        }
      );
    });
  }

  checkDepInstalled(baseDir, spin, allDeps) {
    const nmDir = join(baseDir, 'node_modules');
    const notFind = allDeps.filter(dep => {
      return !existsSync(join(nmDir, dep));
    });
    if (!notFind.length) {
      return;
    }
    spin.text = `[${allDeps.length - notFind.length}/${
      allDeps.length
    }] Denpendecies installing...`;
    clearTimeout(this.checkDepInstallTimeout);
    this.checkDepInstallTimeout = setTimeout(() => {
      this.checkDepInstalled(baseDir, spin, allDeps);
    }, 200);
  }

  printUsage() {
    console.log(
      'Successfully created project',
      chalk.hex('#3eab34')(this.projectName)
    );
    console.log('Get started with the following commands:');
    console.log('');
    console.log(
      chalk.hex('#777777')(
        `$ cd ${relative(this.core.cwd, this.projectDirPath)}`
      )
    );
    console.log(chalk.hex('#777777')('$ npm run dev'));
    console.log('');
    console.log('');
    console.log(chalk.hex('#3eab34')('Thanks for using Midway'));
    console.log('');
    console.log(
      'Document ❤ Star:',
      chalk.hex('#1C95E2')('https://github.com/midwayjs/midway')
    );
    console.log('');
  }
}
