/*
 * This file is part of ciboard-server

 * Copyright (c) 2022, 2023 Andrei Stepanov <astepano@redhat.com>
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

import _, { entriesIn } from 'lodash';
import * as graphql from 'graphql';
import {
  GraphQLInt,
  GraphQLString,
  GraphQLBoolean,
  GraphQLObjectType,
} from 'graphql';
import debug from 'debug';
import util from 'util';
import { GraphQLJSON } from 'graphql-type-json';
import {
  GraphQLFieldConfig,
  GraphQLID,
  GraphQLList,
  GraphQLNonNull,
} from 'graphql';

import printify from '../services/printify';
import { getcfg } from '../cfg';
import { UserSamlType } from './db_types';
import { MetadataModel } from '../services/db_interface';
import { assertMetadataIsValid } from '../services/validation_ajv';
import { getOpensearchClient, OpensearchClient } from '../services/db';
import { ApiResponse, RequestParams } from '@opensearch-project/opensearch/.';

const log = debug('osci:metadata_types');
const cfg = getcfg();

const metadataFilter = (
  testcaseName: string,
  productVersion: string | undefined,
  metadataEntry: UpdateMetadataArgs,
) => {
  const entryProductVersion = metadataEntry.productVersion;
  const entryTestcaseName = metadataEntry.testcaseName;
  const entryTestcaseNameIsRegex = metadataEntry.testcaseNameIsRegex;
  if (!entryTestcaseName) {
    return false;
  }
  if (productVersion && productVersion != entryProductVersion) {
    return false;
  }
  if (entryTestcaseNameIsRegex) {
    const regex = new RegExp(entryTestcaseName);
    if (regex.test(testcaseName)) {
      return true;
    }
  } else if (entryTestcaseName === testcaseName) {
    return true;
  }
  return false;
};

function customMerge(presentVaule: any, newValue: any) {
  if (
    ((_.isArray(presentVaule) && _.isArray(newValue)) ||
      (_.isString(presentVaule) && _.isString(newValue))) &&
    _.isEmpty(newValue)
  ) {
    return presentVaule;
  }
  /**
   * Return: undefined
   * If customizer returns undefined, merging is handled by the method instead:
   * Source properties that resolve to undefined are skipped if a destination value exists.
   * Array and plain object properties are merged recursively.
   * Other objects and value types are overridden by assignment.
   */
}

/**
 * History management is not implemented in Opensearch. In MongoDB it history was in document.
 * In opensearch it is better to store history in different place.
 */
export const MetadataModHistory = new GraphQLObjectType({
  name: 'CISystemModHistory',
  fields: () => ({
    author: {
      type: GraphQLString,
      description: 'A user who made modification.',
    },
    time: {
      type: GraphQLString,
      description: 'Date encoded in ISO 8601 format.',
    },
  }),
});

const mkHistoryEntry = (user: UserSamlType) => {
  const allowedRWGroups = cfg.metadata.rw_groups.set;
  const rwGroups = _.intersection(user.Role, allowedRWGroups);
  return {
    time: new Date().toISOString(),
    author: user.displayName,
    rwGroups,
  };
};

export const MetadataRawType = new GraphQLObjectType({
  name: 'MetadataRawType',
  fields: () => ({
    _id: { type: GraphQLID, description: 'internal ID for CI-system ' },
    payload: { type: GraphQLJSON, description: 'Payload according to schema.' },
    priority: {
      type: GraphQLInt,
      description: 'Priority of this metadata.',
    },
    productVersion: {
      type: GraphQLString,
      description: 'If present, metadata applies to specific product.',
    },
    _updated: {
      type: GraphQLString,
      description: 'When the document was updated.',
    },
    testcaseName: { type: GraphQLString, description: 'CI-system name' },
    testcaseNameIsRegex: {
      type: graphql.GraphQLBoolean,
      description: 'testcaseName is encoded in regex JS regex',
    },
  }),
});

export const MetadataConsolidatedType = new GraphQLObjectType({
  name: 'MetadataConsolidatedType',
  fields: () => ({
    payload: { type: GraphQLJSON, description: 'Consolidated payload' },
  }),
});

export const AuthZMappingType = new GraphQLObjectType({
  name: 'AuthZMappingType',
  fields: () => ({
    can_edit_metadata: {
      type: GraphQLBoolean,
      description: 'If logged in user can edit metadata',
    },
  }),
});

export interface UpdateMetadataArgs {
  _id?: string;
  priority: number;
  payload?: object;
  productVersion?: string;
  testcaseName?: string;
  testcaseNameIsRegex?: boolean;
}

const makeDocumentBody = async (
  param: UpdateMetadataArgs,
): Promise<RequestParams.Index> => {
  const indexesPrefix = cfg.opensearch.indexes_prefix;
  const paramIndexName = `${indexesPrefix}metadata`;
  /* documentId can be undefined, in this case document will be created */
  const documentId = param._id;
  const documentBody: Partial<MetadataModel> = _.pick(
    _.omitBy(param, _.isNil),
    'payload',
    'priority',
    'testcaseName',
    'productVersion',
    'testcaseNameIsRegex',
  );
  const updated = new Date().toISOString();
  documentBody._updated = updated;
  await assertMetadataIsValid(documentBody);
  const document: RequestParams.Index = {
    id: documentId,
    body: documentBody,
    index: paramIndexName,
  };
  return document;
};

export const metadataUpdate: GraphQLFieldConfig<any, any> = {
  type: MetadataRawType,
  description: 'Update metadata for specific ci-system.',
  args: {
    _id: {
      type: GraphQLID,
      description:
        'CI-system personal ID, used in dashboard-DB. If empty, create a new entry for CI-system. If single _id -> remove entry.',
    },
    testcaseName: {
      type: GraphQLString,
      description:
        'ResultsDB testcase. Can be regex. Check https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions for reference.',
    },
    productVersion: {
      type: GraphQLString,
      description:
        'Narrow scope of these metadata to specific product-version. Example: rhel-8',
    },
    testcaseNameIsRegex: {
      type: GraphQLBoolean,
      description: 'testcaseName is regex.',
    },
    priority: {
      type: GraphQLInt,
      description: 'metadata priority',
    },
    payload: {
      type: GraphQLJSON,
      description: 'CI-system info.',
    },
  },
  async resolve(_parentValue, args, request) {
    const logref = _.compact([
      args._id,
      args.testcaseName,
      args.testcaseNameIsRegex,
    ]).toString();
    const { user } = request;
    if (!user || !user.displayName) {
      const comment = util.format(
        'User is not logged, when updating metadata update for: %s',
        logref,
      );
      log(comment);
      // XXX return new Error(comment);
    }
    const allowedRWGroups = cfg.metadata.rw_groups.set;
    /*
     * Local devel: set `user` to:
     * fakeUser = { nameID: 'an', displayName: 'A N', Role: ['Employee'] } as UserSamlType,
     */
    const fakeUser = {
      nameID: 'an',
      displayName: 'A N',
      Role: ['Employee'],
    } as UserSamlType;
    const rwGroups = _.intersection(fakeUser.Role, allowedRWGroups);
    if (_.isEmpty(rwGroups)) {
      const comment = util.format(
        'User does not stay in any allowed RW group to update metadata: %s, %s.',
        allowedRWGroups,
        logref,
      );
      log(comment);
      return new Error(comment);
    }
    log(
      'User %s is granted to perform RW action. User is part of %s groups.',
      fakeUser.displayName,
      rwGroups,
    );
    let opensearchClient: OpensearchClient;
    opensearchClient = await getOpensearchClient();
    if (_.isUndefined(opensearchClient.client)) {
      throw new Error('Connection is not initialized');
    }
    const documentId = args._id;
    const deleteDocument = _.isEmpty(_.omit(args, ['_id'])) && documentId;
    if (deleteDocument) {
      const indexesPrefix = cfg.opensearch.indexes_prefix;
      const paramIndexName = `${indexesPrefix}metadata`;
      let result: ApiResponse = await opensearchClient.client.delete({
        index: paramIndexName,
        id: documentId,
      });
      return {};
    }
    const documentBody: RequestParams.Index = await makeDocumentBody(
      args as UpdateMetadataArgs,
    );
    let result: ApiResponse = await opensearchClient.client.index(documentBody);
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(documentBody),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    return documentBody.body;
  },
};

export const makeSearchBodySst = (): RequestParams.Search => {
  const indexesPrefix = cfg.opensearch.indexes_prefix;
  const paramIndexName = `${indexesPrefix}metadata`;
  const requestBodyString = `
  {
    "query": {
      "match_all": {}
    }
  }
  `;
  const requestParams: RequestParams.Search = {
    body: requestBodyString,
    index: paramIndexName,
  };
  return requestParams;
};

export const metadataConsolidated: GraphQLFieldConfig<any, any> = {
  type: MetadataConsolidatedType,
  description: 'Returns consolidated metadata for specified testcase.',
  args: {
    testcaseName: {
      type: new GraphQLNonNull(GraphQLString),
      description:
        'Exact testcase name. Example: osci.brew-build./plans/tier1-internal.functional',
    },
    productVersion: {
      type: GraphQLString,
      description:
        /* product version == greenwave productVersion */
        'Narrow metadata only for specific product version, including common metadata. Example: rhel-8. If not specified, show for all available products.',
    },
  },
  async resolve(_parentValue, args, _context, _info) {
    const { testcaseName, productVersion } = args;
    let opensearchClient: OpensearchClient;
    opensearchClient = await getOpensearchClient();
    if (_.isUndefined(opensearchClient.client)) {
      throw new Error('Connection is not initialized');
    }
    const searchBody: RequestParams.Search = makeSearchBodySst();
    let result: ApiResponse = await opensearchClient.client.search(searchBody);
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(searchBody),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    /**
     * 1. Fetch all entries to metadata entries.
     * 2. Each entry can be a regex, based on this compare to testcaseName
     */
    const hitsItems = _.get(result, 'body.hits.hits', []);
    const entries = _.map(hitsItems, _.partial(_.get, _, '_source'));
    const relatedEntries = _.filter(
      entries,
      _.partial(metadataFilter, testcaseName, productVersion),
    );
    const sortedByPrio = _.sortBy(relatedEntries, [
      function (o) {
        return o.priority;
      },
    ]);
    const payloads = _.map(sortedByPrio, _.partial(_.get, _, 'payload'));
    const mergedMetadata = _.mergeWith({}, ...payloads, customMerge);
    return { payload: mergedMetadata };
  },
};

export const metadataRaw: GraphQLFieldConfig<any, any> = {
  type: new GraphQLList(MetadataRawType),
  description: 'Returns a list of raw metadata.',
  args: {
    _id: {
      type: GraphQLString,
      description: 'Fetch only metadata for entry with ID',
    },
  },
  async resolve(_parentValue, args, _context, _info) {
    const { _id } = args;
    let opensearchClient: OpensearchClient;
    opensearchClient = await getOpensearchClient();
    if (_.isUndefined(opensearchClient.client)) {
      throw new Error('Connection is not initialized');
    }
    const indexesPrefix = cfg.opensearch.indexes_prefix;
    const paramIndexName = `${indexesPrefix}metadata`;
    const response = await opensearchClient.client.get({
      index: paramIndexName,
      id: _id,
    });
    return _.get(response, 'body._source');
  },
};