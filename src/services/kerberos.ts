/*
 * This file is part of ciboard-server

 * Copyright (c) 2021 Andrei Stepanov <astepano@redhat.com>
 * 
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 * 
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import fs from 'fs';
import tmp from 'tmp';
import util from 'util';
import debug from 'debug';
import cron, { ScheduledTask } from 'node-cron';
import exec_sh from 'exec-sh';
const execShPromise = exec_sh.promise;

import { getcfg } from '../cfg';
const cfg = getcfg();
const log = debug('osci:kerberos');

var refresh_task: ScheduledTask | boolean = false;
/**
 * Update kerberos ticket each 2 hours:
 */
const refresh_krb = '2 */2 * * *';

export default function init_krb() {
  if (!cfg.krb.keytab || !cfg.krb.principal) {
    log('Skip krb init. Provide krb configuration.');
    return;
  }

  log('Activate keytab for principal: %s', cfg.krb.principal);
  const keytab_path = tmp.tmpNameSync();
  log('Store keytab at: %s', keytab_path);
  let buff = Buffer.from(cfg.krb.keytab, 'base64');
  fs.writeFileSync(keytab_path, buff);
  const cmd_krb_init = util.format(
    'kinit -k -t %s %s',
    keytab_path,
    cfg.krb.principal
  );
  execShPromise(cmd_krb_init)
    .then((out) => log('%s,%s', out.stdout, out.stderr))
    .then(() => execShPromise('klist'))
    .then((out) => log('%s,%s', out.stdout, out.stderr))
    .then(() => {
      if (refresh_task) {
        return;
      }
      log('Initialize refreshing kerberos credentials: %s', refresh_krb);
      refresh_task = cron.schedule(refresh_krb, function () {
        log('Time to update kerberos credentials');
        init_krb();
      });
    })
    .catch((e) => {
      console.log('Error: ', e);
      console.log('Stderr: ', e.stderr);
      console.log('Stdout: ', e.stdout);
      return e;
    })
    .finally(() => {
      log('Rm: %s', keytab_path);
      fs.unlinkSync(keytab_path);
    });
}
