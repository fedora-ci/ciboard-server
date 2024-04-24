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

import _ from 'lodash';
import axios from 'axios';
import debug from 'debug';
import assert from 'assert';
import {
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLFieldConfig,
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';

import { getcfg } from '../cfg';
import { printify } from '../services/printify';
import { ApiResponse, RequestParams } from '@opensearch-project/opensearch/.';
import { OpensearchClient, getOpensearchClient } from '../services/db';

const cfg = getcfg();
const log = debug('osci:schema/sst_types');

export type SSTInfoType = {
  name: string;
  display_name: string;
  releases: { name: string; url: string }[];
};

const SSTItemType = new GraphQLObjectType({
  name: 'SSTItemType',
  fields: () => ({
    name: { type: GraphQLString },
    display_name: { type: GraphQLString },
    releases: { type: new GraphQLList(GraphQLString) },
  }),
});

export const SSTListType = new GraphQLList(SSTItemType);

export const SstHitType = new GraphQLObjectType({
  name: 'SstHitType',
  description: 'Artifact entry.',
  fields: () => ({
    hit_source: {
      type: GraphQLJSON,
      description: 'db-document',
    },
    hit_info: {
      type: GraphQLJSON,
      description: 'info about db-document',
    },
    components: {
      type: new GraphQLList(GraphQLJSON),
      description: 'Components',
    },
  }),
});

export const SstInfoType = new GraphQLObjectType({
  name: 'SstInfoType',
  fields: () => ({
    hits: { type: new GraphQLList(SstHitType) },
    hits_info: {
      type: GraphQLJSON,
      description: 'information about opensearch-query',
    },
  }),
});

export const querySstResults: GraphQLFieldConfig<any, any> = {
  /* do not hardcode exact structure of reply from sst backend, do any interpretation on backend */
  type: new GraphQLList(GraphQLJSON),
  args: {
    sst_name: { type: new GraphQLNonNull(GraphQLString) },
    release: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(_parentValue, { sst_name, release }) {
    const results_json_url = new URL(
      `/results/${sst_name}.${release}.json`,
      cfg.sst.url,
    ).toString();
    const response = await axios.get(results_json_url);
    /* axios.get can throw exception, if we are here then no exception */
    const data = response.data?.data;
    assert.ok(_.isArray(data), 'Exptected array reply');
    return data as (typeof GraphQLJSON)[];
  },
};

export type QueryOptionsSst = {
  productId: string | undefined;
  sstName: string | undefined;
};

export const makeSearchBodySst = (
  queryOptions: QueryOptionsSst,
): RequestParams.Search => {
  const { productId, sstName } = queryOptions;
  const paramSstName = JSON.stringify(sstName);
  const paramProductId = JSON.stringify(productId);
  const indexesPrefix = cfg.opensearch.indexes_prefix;
  const paramIndexName = `${indexesPrefix}components`;
  const requestBodyString = `
  {
    "size": 1000,
    "explain": false,
    "query": {
      "bool": {
        "filter": {
          "has_child": {
            "type": "component",
            "query": {
              "match_all": {}
            },
            "inner_hits": {
              "_source": true
            }
          }
        },
        "must": []
      }
    },
    "sort": [
      {
        "_score": {
          "order": "desc"
        }
      },
      {
        "sst.productId.number": {
          "order": "desc"
        }
      }
    ]
  }
  `;
  const mustProductIdString = `
    {
      "term": {
        "sst.productId": {
          "value": ${paramProductId}
        }
      }
    }
  `;
  const mustSstNameString = `
    {
      "query_string": {
        "query": ${paramSstName},
        "fields": ["sst.sstName"]
      }
    }
  `;
  const requestBody = JSON.parse(requestBodyString);
  let i = 0;
  if (productId) {
    _.set(
      requestBody,
      `query.bool.must[${i}]`,
      JSON.parse(mustProductIdString),
    );
    i++;
  }
  if (sstName) {
    _.set(requestBody, `query.bool.must[${i}]`, JSON.parse(mustSstNameString));
  }
  const requestParams: RequestParams.Search = {
    body: JSON.stringify(requestBody),
    index: paramIndexName,
  };
  return requestParams;
};

export const querySstInfo: GraphQLFieldConfig<any, any> = {
  type: SstInfoType,
  description: 'List know SST teams.',
  args: {
    productId: {
      type: GraphQLInt,
      description:
        'Return results only for specified product id. RHEL 9: 604, RHEL: 8: 370',
    },
    sstName: {
      type: GraphQLString,
      description: 'part of sst name',
    },
  },
  async resolve(_parentValue, args, _context, _info) {
    const { productId, sstName } = args;
    let opensearchClient: OpensearchClient;
    try {
      opensearchClient = await getOpensearchClient();
      if (_.isUndefined(opensearchClient.client)) {
        throw new Error('Connection is not initialized');
      }
    } catch (err) {
      throw err;
    }
    const searchBody: RequestParams.Search = makeSearchBodySst({
      sstName,
      productId,
    });
    let result: ApiResponse = await opensearchClient.client.search(searchBody);
    log(
      ' [i] query -> %s -> answer -> %s',
      printify(searchBody),
      printify(_.omit(result.body, ['hits.hits'])),
    );
    /** transform Opensearch reply */
    const hitsItems = _.get(result, 'body.hits.hits', []);
    const hits = _.map(hitsItems, (hit) => ({
      hit_source: _.get(hit, '_source'),
      hit_info: _.omit(hit, ['_source', 'inner_hits']),
      components: _.get(hit, 'inner_hits.component.hits.hits'),
    }));
    const hitsData = _.get(result, 'body.hits', {});
    const hits_info = _.omit(hitsData, ['hits']);
    const reply = { hits, hits_info };
    return reply;
  },
};

export const querySstList: GraphQLFieldConfig<any, any> = {
  type: SSTListType,
  resolve() {
    const url = new URL(cfg.sst.results, cfg.sst.url);
    return axios.get(url.toString()).then((response) =>
      response.data.map((sst: SSTInfoType) => {
        const releases = (sst.releases || []).map((rel) => rel.name);
        const { name, display_name } = sst;
        return { name, display_name, releases };
      }),
    );
  },
};
