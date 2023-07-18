/*
 * This file is part of ciboard-server

 * Copyright (c) 2021, 2022, 2023 Andrei Stepanov <astepano@redhat.com>
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
import debug from 'debug';
import assert from 'assert';
import { Client, ClientOptions } from '@opensearch-project/opensearch';
import { getcfg } from '../cfg';

const log = debug('osci:db');
const cfg = getcfg();
const options_default = {};

const options: ClientOptions = _.pickBy(
  _.defaultsDeep(cfg.opensearch.client, options_default),
);

log(' [i] opensearch client options: %O', options);

export class OpensearchClient {
  public client?: Client;
  private clientOptions: ClientOptions;

  constructor() {
    const config = cfg.opensearch;
    this.clientOptions = config.client;
    this.client = new Client(this.clientOptions);
  }

  log(s: string, ...args: any[]): void {
    const msg = ` [I] ${s}`;
    log(msg, ...args);
  }

  fail(s: string, ...args: any[]): void {
    const msg = ` [E] ${s}`;
    log(msg, ...args);
  }

  async init(): Promise<void> {
    try {
      assert.ok(this.client, 'Opensearch client is empty.');
    } catch (err) {
      await this.client?.close();
      throw err;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch (err) {
      this.fail('Cannot close connection to Opensearch.');
      throw err;
    }
  }
}

export async function _getOpensearchClient(): Promise<OpensearchClient> {
  const client = new OpensearchClient();
  await client.init();
  return client;
}

export const getOpensearchClient = _.memoize(_getOpensearchClient);
