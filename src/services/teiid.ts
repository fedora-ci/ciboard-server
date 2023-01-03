/*
 * This file is part of ciboard-server

 * Copyright (c) 2022 Andrei Stepanov <astepano@redhat.com>
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

/*
 * https://mongodb.github.io/node-mongodb-native/
 */

import _ from 'lodash';
import process from 'process';
import debug from 'debug';
import assert from 'assert';
import { getcfg, TKnownType, known_types } from '../cfg';

const log = debug('osci:services/teiid');
const cfg = getcfg();

import { Client, ClientConfig } from 'pg';

export async function _getClient(): Promise<Client | undefined> {
  /*
   * pg-client can use environment variables.
   * Every field of the config object is entirely optional. A Client instance will use environment variables for all missing values.
   */
  const config: ClientConfig = cfg.teiid.client_config;
  let client;
  try {
    client = new Client(config);
    await client.connect();
  } catch (error) {
    log(
      ' [E] cannot initialize collection to Teiid. Continue running. Any query on Teiid will fail.',
    );
    if (_.isError(error)) {
      log(' [w] Teiid connection: ', error.message);
    }
    return;
  }
  return client;
}

export const getTeiidClient = _.memoize(_getClient);

(async function init() {
  /* Query for testing purpose to check on startup if Teiid is responsive */
  const testQuery = `
  SELECT
        c.id, c.created_at, c.fulladvisory
  FROM
        Errata_public.errata_main c
  WHERE
        c.id=(SELECT MAX(id) FROM Errata_public.errata_main)
  LIMIT 1`;
  const client = await getTeiidClient();
  if (!client) {
    log(' [w] cannot init connection to Teiid. Continue running.');
    return;
  }
  const res = await client.query(testQuery);
  assert.ok(
    _.size(res.rows) === 1,
    'Unexpected reply from Teiid for test query.',
  );
  log(' [i] Connected successfully to Teiid.');
  log(
    ' [i] The most recent entry in Errata_public.errata_main: %o',
    res.rows[0],
  );
  /* If at this point, then there is no exception */
})().catch((...error) => {
  console.error('Cannot pass Teiid initialization.');
  console.dir(...error);
  process.exit(1);
});
