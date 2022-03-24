/*
 * This file is part of ciboard-server

 * Copyright (c) 2021, 2022 Andrei Stepanov <astepano@redhat.com>
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
  AggregationCursor,
  Document,
  FindCursor,
  MongoClient,
  MongoClientOptions,
  SortDirection,
} from 'mongodb';
import { getcfg, TKnownType, known_types } from '../cfg';

const log = debug('osci:db');
const cfg = getcfg();

const options_default = {};
const options: MongoClientOptions = _.pickBy(
  _.defaultsDeep(cfg.db.options, options_default)
);

log(' [i] mongo client options: %O', options);

async function attemptAsync<T>(
  func: (...args: any[]) => Promise<T>,
  ...args: any[]
): Promise<Error | T> {
  try {
    return await func(...args);
  } catch (e) {
    if (_.isError(e)) {
      return e;
    }
    throw e;
  }
}

const mkClient = (): Promise<MongoClient> => {
  var mongoClient;
  try {
    mongoClient = new MongoClient(cfg.db.url, options);
  } catch (e) {
    console.log('Failed to create mongo configuration. Check options.');
    console.dir(e);
    process.exit(1);
  }
  return mongoClient.connect();
};

const clientPromise: Promise<Error | MongoClient> =
  attemptAsync<MongoClient>(mkClient);

const getClient = async (
  clientPromise: Promise<Error | MongoClient>
): Promise<MongoClient> => {
  const client = await clientPromise;
  if (_.isError(client)) {
    console.dir(clientPromise);
    process.exit(1);
  }
  return client;
};

/** For reduced query */
const project = {
  'states.xunit': 0,
  'states.test.xunit': 0,
};

const mk_filter = (
  atype: TKnownType | null,
  dbFieldName: string,
  dbFieldValues: any,
  valuesAreRegex: boolean
) => {
  if (_.isArray(dbFieldValues) && _.size(dbFieldValues)) {
    log(
      'dbFieldName: %s, dbFieldValues: %s, valuesAreRegex: %s',
      dbFieldName,
      dbFieldValues,
      valuesAreRegex
    );
    var field: string;
    if (dbFieldName) {
      field = dbFieldName;
    } else if (!_.isNull(atype)) {
      field = known_types[atype];
    } else {
      throw new Error('Bad call to mk_filter()');
    }
    const values = valuesAreRegex
      ? _.map(dbFieldValues, (r) => new RegExp(r, 'g'))
      : dbFieldValues;
    return { [field]: { $in: values } };
  }
};

(async function test() {
  const client = await getClient(clientPromise);
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

export type QueryOptions = {
  atype: TKnownType;
  limit: number;
  regexs: RegExp[];
  options: {
    skipScratch?: boolean;
    reduced?: boolean;
    valuesAreRegex1?: boolean;
    valuesAreRegex2?: boolean;
    valuesAreRegex3?: boolean;
    valuesAreRegexComponentMapping1?: boolean;
    componentMappingProductId?: number;
  };
  aid_offset: number;
  dbFieldName1: string;
  dbFieldName2: string;
  dbFieldName3: string;
  dbFieldValues1: any;
  dbFieldValues2: any;
  dbFieldValues3: any;
  dbFieldNameComponentMapping1: string;
  dbFieldValuesComponentMapping1: any;
};

interface MongoQuery {
  [dbFieldName: string]: any;
  aid?: any;
  type: TKnownType;
}

/**
    {"type":"brew-build", "aid":{"$in":["30843086", "30972681"]}}
    {"type":"brew-build", "nvr":{"$in":[/^scap/, /^gdm/, /^bash/]}}
    {aid:1, nvr:1}
*/

export const mk_cursor = async (args: QueryOptions) => {
  const {
    atype,
    limit,
    options: {
      skipScratch,
      reduced,
      valuesAreRegex1,
      valuesAreRegex2,
      valuesAreRegex3,
      valuesAreRegexComponentMapping1,
      componentMappingProductId,
    },
    aid_offset,
    dbFieldName1,
    dbFieldName2,
    dbFieldName3,
    dbFieldNameComponentMapping1,
    dbFieldValues1,
    dbFieldValues2,
    dbFieldValues3,
    dbFieldValuesComponentMapping1,
  } = args;
  if (_.isError(clientPromise)) {
    console.dir(clientPromise);
    process.exit(1);
  }
  const client = await getClient(clientPromise);
  const database = client.db(cfg.db.db_name);
  const collection = database.collection(cfg.db.collection_name);
  /** look-up by name -> nvr, nsvc, ... */
  const name = known_types[atype];
  var numericOrdering = name === 'nvr' || name === 'nsvc';
  var aid_direction: SortDirection = -1;
  var aid;
  if (aid_offset) {
    aid = { $lt: aid_offset };
  } else {
    aid = { $gt: '' };
  }
  const match: MongoQuery = {
    type: atype,
    aid: aid,
  };
  if (componentMappingProductId) {
    match['gate_tag_name'] = { $gt: '' };
  }
  if (skipScratch) {
    match['scratch'] = false;
  }
  for (const args of [
    [dbFieldName1, dbFieldValues1, valuesAreRegex1],
    [dbFieldName2, dbFieldValues2, valuesAreRegex2],
    [dbFieldName3, dbFieldValues3, valuesAreRegex3],
  ]) {
    const filter = mk_filter(atype, ...(args as [string, any, boolean]));
    if (!_.isNil(filter)) {
      _.assign(match, filter);
    }
  }
  const aggregate_pipeline = [];
  aggregate_pipeline.push({
    $match: match,
  });
  aggregate_pipeline.push({
    $sort: {
      aid: aid_direction,
    },
  });
  if (componentMappingProductId) {
    /** Components mapping only for gating tags */
    aggregate_pipeline.push({
      $lookup: {
        from: 'components_mapping',
        localField: 'component',
        foreignField: 'component_name',
        as: 'component_mapping',
      },
    });
    aggregate_pipeline.push({ $unwind: '$component_mapping' });
    const match = {
      'component_mapping.product_id': componentMappingProductId,
    };
    aggregate_pipeline.push({
      $match: match,
    });
    if (
      dbFieldNameComponentMapping1 &&
      _.isArray(dbFieldValuesComponentMapping1) &&
      _.size(dbFieldValuesComponentMapping1)
    ) {
      const is_regex = _.isBoolean(valuesAreRegexComponentMapping1)
        ? valuesAreRegexComponentMapping1
        : false;
      const filter = mk_filter(
        null,
        `component_mapping.${dbFieldNameComponentMapping1}`,
        dbFieldValuesComponentMapping1,
        is_regex
      );
      _.assign(match, filter);
    }
  }
  aggregate_pipeline.push({
    $limit: limit,
  });
  if (reduced) {
    aggregate_pipeline.push({
      $project: project,
    });
  }
  log('Make aggregation pipeline: %s', JSON.stringify(aggregate_pipeline));
  const cursor: AggregationCursor<Document> = collection.aggregate(
    aggregate_pipeline,
    {
      collation: {
        locale: 'en_US',
        numericOrdering: numericOrdering,
      },
    }
  );
  /** Remember to cursor.close(); */
  return cursor;
};

export const db_list_sst = async (product_id: number) => {
  const client = await getClient(clientPromise);
  const database = client.db(cfg.db.db_name);
  const collection = database.collection(cfg.db.collection_name_components);
  log('List SST names');
  var sst_names;
  if (_.isNumber(product_id)) {
    sst_names = await collection.distinct('sst_team_name', {
      product_id,
    });
  } else {
    sst_names = await collection.distinct('sst_team_name');
  }
  return sst_names.sort((a, b) => _.toString(a).localeCompare(_.toString(b)));
};
