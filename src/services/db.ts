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

import _ from 'lodash';
import process from 'process';
import debug from 'debug';
import {
  Document,
  FindCursor,
  MongoClient,
  MongoClientOptions,
  SortDirection,
} from 'mongodb';
import { getcfg } from '../cfg';

const log = debug('osci:db');
const cfg = getcfg();

const options_default = {};
const options: MongoClientOptions = _.pickBy(
  _.defaultsDeep(cfg.db.options, options_default)
);

log(' [i] mongo client options: %O', options);

export const client_promise = new MongoClient(cfg.db.url, options).connect();

(async function test() {
  const client = await client_promise;
  const database = client.db('ci-messages');
  const collection = database.collection('artifacts');
  const cursor = collection.find().sort({ _id: -1 }).limit(1);
  const artifacts = await cursor.toArray();
  const last = artifacts[0];
  log(
    "Latest entry: {aid: '%s', type: '%s', updated: %s}",
    last['aid'],
    last['type'],
    last['_updated']
  );
  await cursor.close();
})().catch((...error) => {
  console.dir(...error);
  process.exit(1);
});

const known_types = {
  'brew-build': 'rpm_build.nvr',
  'koji-build': 'rpm_build.nvr',
  'redhat-module': 'mbs_build.nsvc',
  'copr-build': 'component',
  'productmd-compose': 'compose.aid',
};

type artifact_type = keyof typeof known_types;

export type QueryOptions = {
  atype: artifact_type;
  limit: number;
  regexs: RegExp[];
  options: {
    skipScratch?: boolean;
  };
  aid_offset: number;
  dbFieldName: string;
  dbFieldValues: any;
};

interface MongoQuery {
  [dbFieldName: string]: any;
  aid?: any;
  type: artifact_type;
}

/**
 * DB should have corresponded indexes
 */
export const mk_cursor = async (args: QueryOptions) => {
  const {
    atype,
    limit,
    regexs,
    options: { skipScratch },
    aid_offset,
    dbFieldName,
    dbFieldValues,
  } = args;
  const client = await client_promise;
  const database = client.db(cfg.db.db_name);
  const collection = database.collection(cfg.db.collection_name);
  var cursor: FindCursor<Document>;
  const name = known_types[atype];
  var numericOrdering = name === 'nvr' || name === 'nsvc';
  var aid_direction: SortDirection = -1;
  if (dbFieldValues) {
    /**
     * {"type":"brew-build", "aid":{"$in":["30843086", "30972681"]}}
     */
    const query: MongoQuery = {
      type: atype,
      [dbFieldName]: { $in: dbFieldValues },
    };
    if (aid_offset) {
      query['aid'] = { $lt: aid_offset };
    }
    log(' [i] make query: %o', query);
    cursor = collection
      .find(query)
      .collation({
        locale: 'en_US',
        numericOrdering: numericOrdering,
      })
      .sort({ aid: aid_direction })
      .limit(limit);
  } else if (regexs) {
    /**
     * {"type":"brew-build", "nvr":{"$in":[/^scap/, /^gdm/, /^bash/]}}
     * {aid:1, nvr:1}
     */
    const query: MongoQuery = {
      type: atype,
      [name]: {
        $in: _.map(regexs, (r) => new RegExp(r, 'g')),
      },
    };
    if (aid_offset) {
      query['aid'] = { $lt: aid_offset };
    }
    if (skipScratch) {
      query['scratch'] = false;
    }
    log('Make query: %o', query);
    cursor = collection
      .find(query)
      .collation({
        locale: 'en_US',
        numericOrdering: numericOrdering,
      })
      .sort({ aid: aid_direction })
      .limit(limit)
      .project({
        states: 0,
        'current-state.error.xunit': 0,
        'current-state.queued.xunit': 0,
        'current-state.waived.xunit': 0,
        'current-state.running.xunit': 0,
        'current-state.complete.xunit': 0,
      });
  } else {
    throw new Error('Incorrect arguments for mk_cursor()');
  }
  /**
   * Remember to cursor.close();
   */
  return cursor;
};
