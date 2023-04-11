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

/*
 * https://mongodb.github.io/node-mongodb-native/
 */

import _ from 'lodash';
import process from 'process';
import debug from 'debug';
import assert from 'assert';
import {
  Db,
  Filter,
  Document,
  ObjectId,
  Collection,
  MongoError,
  MongoClient,
  ModifyResult,
  SortDirection,
  MongoClientOptions,
  AggregationCursor,
  MongoClientEvents,
} from 'mongodb';
import { getcfg, TKnownType, known_types } from '../cfg';
import { ArtifactModel, ComponentsModel, MetadataModel } from './db_interface';
import { UpdateMetadataArgs, UserSamlType } from '../schema/db_types';
import { assertMetadataIsValid } from './validation_ajv';

const log = debug('osci:db');
const cfg = getcfg();

const options_default = {};
const options: MongoClientOptions = _.pickBy(
  _.defaultsDeep(cfg.db.options, options_default),
);

log(' [i] mongo client options: %O', options);

/** For reduced query */
const project = {
  'states.xunit': 0,
  'states.test.xunit': 0,
};

export class ToLargeDocumentError extends Error {
  constructor(m: string) {
    super(m);
    /**
     * Set the prototype explicitly.
     */
    Object.setPrototypeOf(this, ToLargeDocumentError.prototype);
  }
}

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

function on_close(err: MongoError): void {
  console.warn(`db socket closed: ${err}`);
  process.exit(1);
}

function on_error(err: MongoError): void {
  console.warn(`db error occurred: ${err}`);
  process.exit(1);
}

function on_timeout(err: MongoError): void {
  console.warn(`socket timeout occurred: ${err}`);
  process.exit(1);
}

function on_commandFailed(obj: any): void {
  console.warn(`mongodb command failed with ${obj.toString()}`);
}

class DBCollection<TSchema extends Document = Document> {
  private cfg_entry: keyof typeof cfg.db.collections;
  public collection_name: string;
  public url: string;
  /** Use the same DB instance. Any consequential db-open will return the same instance. */
  public db?: Db;
  public collection?: Collection<TSchema>;
  /** Mongo client -> client-server connection -> db instance 1, db instance 2, ... */
  public mongo_client: MongoClient;
  public db_name?: string;
  public options?: MongoClientOptions;
  public static def_options: MongoClientOptions = {};

  constructor(
    cfg_entry: keyof typeof cfg.db.collections,
    url?: string,
    collection_name?: string,
    db_name?: string,
    options?: MongoClientOptions,
  ) {
    this.cfg_entry = cfg_entry;
    this.url = url || cfg.db.url;
    this.collection_name =
      collection_name || cfg.db.collections[this.cfg_entry].name;
    this.db_name = db_name || cfg.db.db_name;
    /** http://mongodb.github.io/node-mongodb-native/3.6/api/MongoClient.html */
    const opts = options || _.cloneDeep(DBCollection.def_options);
    _.merge(opts, options);
    try {
      this.mongo_client = new MongoClient(this.url, opts);
    } catch (e) {
      console.log('Failed to create mongo configuration. Check options.');
      console.dir(e);
      process.exit(1);
    }
  }

  log(s: string, ...args: any[]): void {
    const msg = ` [i] ${this.collection_name} ${s}`;
    log(msg, ...args);
  }

  fail(s: string, ...args: any[]): void {
    const msg = ` [E] ${this.collection_name} ${s}`;
    log(msg, ...args);
  }

  async init(): Promise<void> {
    try {
      await this.mongo_client.connect();
      /** If db name is not provided, use database name from connection string. */
      this.db = this.mongo_client.db(this.db_name);
      /** verify connection */
      this.db.command({ ping: 1 });
      const collections = await this.db.listCollections().toArray();
      const collectionNames = collections.map((c) => c.name);
      if (!collectionNames.includes(this.collection_name)) {
        await this.db.createCollection(this.collection_name);
      }
      this.collection = this.db.collection<TSchema>(this.collection_name);
      this.log('Connected successfully to collection.');
      /** Db is no longer the place to listen to events, you should listen to your MongoClient. */
      this.mongo_client.on('close', on_close);
      this.mongo_client.on('error', on_error);
      this.mongo_client.on('timeout', on_timeout);
      this.mongo_client.on('commandFailed', on_commandFailed);
    } catch (err) {
      this.mongo_client.close();
      throw err;
    }
  }

  async cfg_indexes(): Promise<void> {
    this.log('Configure indexes.');
    const collection_config = cfg.db.collections[this.cfg_entry];
    const indexes_config = collection_config['indexes'];
    if (_.isNil(indexes_config)) {
      this.log('Skip indexes config. No configuration for indexes.');
      return;
    }
    const indexes_active = await this.collection?.indexes();
    this.log('Active indexes: %o', indexes_active);
    this.log('Indexes in configuration: %o', indexes_config);
    const preserve = ['_id_'];
    /** Drop indexes that are absent in configuration */
    const keep = preserve.concat(
      _.map(
        indexes_config,
        _.flow(_.identity, _.partialRight(_.get, 'options.name')),
      ),
    );
    if (!_.isNil(indexes_active) && _.size(indexes_active)) {
      for (const index of indexes_active) {
        if (keep.includes(index.name)) {
          this.log('Keep index: %s', index.name);
          continue;
        }
        this.log('Drop index: %s', index.name);
        await this.collection?.dropIndex(index.name);
      }
    }
    if (!_.size(indexes_config)) {
      this.log('No configuration for indexes.');
      return;
    }
    for (const index of indexes_config) {
      const name = _.get(index, 'options.name');
      const is_present =
        _.findIndex(
          indexes_active,
          _.flow(
            _.identity,
            _.partialRight(_.get, 'name'),
            _.partialRight(_.isEqual, name),
          ),
        ) >= 0;
      if (is_present) {
        this.log('Index is already present: %s', name);
        continue;
      }
      this.log('Add index: %s', name);
      await this.collection?.createIndex(index.keys, index.options);
    }
  }

  async close(): Promise<void> {
    try {
      await this.mongo_client.close();
      await this.mongo_client.close();
    } catch (err) {
      this.fail('Cannot close connection to DB.');
      throw err;
    }
  }
}

export class Artifacts extends DBCollection<ArtifactModel> {
  constructor(
    url?: string,
    collection_name?: string,
    db_name?: string,
    options?: MongoClientOptions,
  ) {
    super('artifacts', collection_name, url, db_name, options);
  }
  private mk_filter = (
    atype: TKnownType | null,
    dbFieldName: string,
    dbFieldValues: any,
    valuesAreRegex: boolean,
  ) => {
    if (_.isArray(dbFieldValues) && _.size(dbFieldValues)) {
      log(
        'dbFieldName: %s, dbFieldValues: %s, valuesAreRegex: %s',
        dbFieldName,
        dbFieldValues,
        valuesAreRegex,
      );
      var field: string;
      if (dbFieldName) {
        field = dbFieldName;
      } else if (!_.isNull(atype)) {
        field = known_types[atype];
      } else {
        throw new Error('Bad call to mk_filter()');
      }
      /**
       * Do not add 'g' to RegExp options, this makes indexes unusable
       * More info: https://www.mongodb.com/docs/manual/reference/operator/query/regex/
       * The $regex implementation is not collation-aware and is unable to utilize case-insensitive indexes.
       */
      const values = valuesAreRegex
        ? _.map(dbFieldValues, (r) => new RegExp(r))
        : dbFieldValues;
      return { [field]: { $in: values } };
    }
  };
  /**
    {"type":"brew-build", "aid":{"$in":["30843086", "30972681"]}}
    {"type":"brew-build", "nvr":{"$in":[/^scap/, /^gdm/, /^bash/]}}
    {aid:1, nvr:1}
*/
  mk_cursor = async (args: QueryOptions) => {
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
    assert.ok(this.collection);
    /** look-up by name -> nvr, nsvc, ... */
    const name = known_types[atype];
    /*
     * turn on numericOrdering to activate db-index
     */
    var numericOrdering = true;
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
      match['payload.gate_tag_name'] = { $gt: '' };
    }
    if (skipScratch) {
      match['payload.scratch'] = false;
    }
    for (const args of [
      [dbFieldName1, dbFieldValues1, valuesAreRegex1],
      [dbFieldName2, dbFieldValues2, valuesAreRegex2],
      [dbFieldName3, dbFieldValues3, valuesAreRegex3],
    ]) {
      const filter = this.mk_filter(atype, ...(args as [string, any, boolean]));
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
          localField: 'payload.component',
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
        const filter = this.mk_filter(
          null,
          `component_mapping.${dbFieldNameComponentMapping1}`,
          dbFieldValuesComponentMapping1,
          is_regex,
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
    const cursor: AggregationCursor<Document> = this.collection.aggregate(
      aggregate_pipeline,
      {
        collation: {
          locale: 'simple',
          numericOrdering,
        },
        /* if query takes more then 9 seconds, then something is wrong */
        maxTimeMS: 9000,
      },
    );
    /** Remember to cursor.close(); */
    return cursor;
  };
}

export class Components extends DBCollection<ComponentsModel> {
  constructor(
    url?: string,
    collection_name?: string,
    db_name?: string,
    options?: MongoClientOptions,
  ) {
    super('components', collection_name, url, db_name, options);
  }
  db_list_sst = async (product_id: number) => {
    assert.ok(this.collection);
    var sst_names;
    if (_.isNumber(product_id)) {
      sst_names = await this.collection.distinct('sst_team_name', {
        product_id,
      });
    } else {
      sst_names = await this.collection.distinct('sst_team_name');
    }
    return sst_names.sort((a, b) => _.toString(a).localeCompare(_.toString(b)));
  };
}

export class Metadata extends DBCollection<MetadataModel> {
  private defaultPriority = 100;
  constructor(
    url?: string,
    collection_name?: string,
    db_name?: string,
    options?: MongoClientOptions,
  ) {
    super('metadata', collection_name, url, db_name, options);
  }

  private mkHistoryEntry = (user: UserSamlType) => {
    const allowedRWGroups = cfg.metadata.rw_groups.set;
    const rwGroups = _.intersection(user.Role, allowedRWGroups);
    return {
      time: new Date().toISOString(),
      author: user.displayName,
      rwGroups,
    };
  };

  find = async (params: Filter<MetadataModel>): Promise<MetadataModel[]> => {
    if (_.isUndefined(this.collection)) {
      throw new Error('Connection is not initialized');
    }
    const cursor = this.collection
      .find(params)
      .sort({ priority: -1 })
      .collation({ locale: 'simple', numericOrdering: true });
    const retrivedMetadata = await cursor.toArray();
    await cursor.close();
    return retrivedMetadata;
  };

  update = async (
    param: UpdateMetadataArgs,
    user: UserSamlType,
  ): Promise<MetadataModel | undefined | null> => {
    if (_.isUndefined(this.collection)) {
      throw new Error('Connection is not initialized');
    }
    /**
     * 1. id == null -> create a new entry
     * 2. sole id != null -> remove present entry
     * 3. else: update present entry
     */
    if (param._id) {
      const _id = new ObjectId(param._id);
      const filter = { _id };
      const deleteEntry = _.isEmpty(_.omit(param, ['_id']));
      if (deleteEntry) {
        /* Remove present entry */
        try {
          log(' [i] metadata delete entry with _id == %s', param._id);
          await this.collection.findOneAndDelete(filter, { retryWrites: true });
        } catch (err) {
          this.fail('findOneAndDelete() failed for param: %o:', filter);
          throw err;
        }
        return;
      } else {
        /* Modify present entry */
        const updateSet: Partial<MetadataModel> = _.pick(
          _.omitBy(param, _.isNil),
          'testcase_name',
          'testcase_name_is_regex',
          'payload',
          'product_version',
          'priority',
        );
        /*
         * values are ignored:
         * https://www.mongodb.com/docs/manual/reference/operator/update/unset/#mongodb-update-up.-unset
         */
        const deleteSet = _.omit(
          {
            test_case_name: '',
            testcase_name_is_regex: '',
            payload: '',
            product_version: '',
            priority: '',
          },
          _.keys(updateSet),
        );
        const updated = new Date().toISOString();
        updateSet._updated = updated;
        const _update_history = this.mkHistoryEntry(user);
        await assertMetadataIsValid(updateSet);
        const updateDoc = {
          $inc: { _version: 1 },
          $set: updateSet,
          $push: { _update_history },
          $unset: deleteSet,
        };
        let modifyResult: ModifyResult<MetadataModel> | undefined;
        try {
          modifyResult = await this.collection.findOneAndUpdate(
            filter,
            updateDoc,
            { returnDocument: 'after', retryWrites: true },
          );
        } catch (err) {
          this.fail('findOneAndUpdate() failed for param: %O:', filter);
          if (
            err instanceof RangeError &&
            _.get(err, 'code') === 'ERR_OUT_OF_RANGE'
          ) {
            const errMsg = `Resulted MongoDB document exceed allowed document.`;
            throw new ToLargeDocumentError(errMsg);
          }
          if (_.isError(err)) {
            this.fail('Cannot modify present metadata. %s', err.message);
          }
          throw err;
        }
        return modifyResult?.value;
      }
    } else {
      /* create a new entry */
      const historyEntry = this.mkHistoryEntry(user);
      const document: Partial<MetadataModel> = _.pick(
        _.omitBy(param, _.isNil),
        'testcase_name',
        'testcase_name_is_regex',
        'product_version',
        'payload',
      );
      const updated = new Date().toISOString();
      document._updated = updated;
      document._version = 1;
      document.priority = _.get(param, 'priority', this.defaultPriority);
      document._update_history = [historyEntry];
      await assertMetadataIsValid(document);
      const insertOneResult = await this.collection.insertOne(
        document as MetadataModel,
      );
      const _id = insertOneResult.insertedId;
      assert.ok(_id, 'Cannot add new metadata');
      try {
        const doc = await this.collection.findOne({ _id });
        return doc;
      } catch (err) {
        this.fail('insertOne() failed for param: %O:', param);
        if (_.isError(err)) {
          this.fail('Cannot create new entry for metadata. %s', err.message);
        }
        throw err;
      }
    }
  };
}

export async function _getCollection<
  T extends Artifacts | Metadata | Components,
>(
  /* Type for Constructor of a Class T in TypeScript */
  c: new (...args: ConstructorParameters<typeof Artifacts>) => T,
  url?: string,
  collection_name?: string,
  db_name?: string,
  options?: MongoClientOptions,
): Promise<T> {
  const collection = new c(url, collection_name, db_name, options);
  await collection.init();
  await collection.cfg_indexes();
  return collection;
}

export const getCollection = _.memoize(_getCollection);

/**
 * Unhandled promise rejection....
 * Use memo
 * XXX: outage for a few tests.
 */

(async function init() {
  const artifacts = await getCollection(Artifacts);
  const components = await getCollection(Components);
  try {
    const metadata = await getCollection(Metadata);
  } catch (error) {
    log(
      ' [E] cannot initialize collection for Metadata. Continue running. Any operation on metadata will fail.',
    );
    if (_.isError(error)) {
      log(' [E] metadata collection initialization error: ', error.message);
    }
  }
  assert.ok(artifacts.collection);
  const cursor = artifacts.collection.find().sort({ _id: -1 }).limit(1);
  const retrivedArtifacts = await cursor.toArray();
  if (_.isEmpty(retrivedArtifacts)) {
    log('DB is empty.');
    return;
  }
  const last = retrivedArtifacts[0];
  if (last) {
    log(
      "Latest entry: {aid: '%s', type: '%s', updated: %s}",
      last['aid'],
      last['type'],
      last['_updated'],
    );
  } else {
    log('No artifact entries in database');
  }
  await cursor.close();
})().catch((...error) => {
  console.dir(...error);
  process.exit(1);
});
