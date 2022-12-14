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

import _ from 'lodash';
import debug from 'debug';
import {
  graphql,
  GraphQLFieldConfig,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import { getTeiidClient } from '../services/teiid';

const log = debug('osci:teiid');

export const TeiidETLinkedAdvisories = new GraphQLObjectType({
  name: 'TeiidLinkedErrata',
  fields: () => ({
    build_nvr: {
      type: GraphQLString,
      description: 'NVR for build.',
    },
    build_id: {
      type: GraphQLInt,
      description: 'Brew build ID.',
    },
    advisory_id: {
      type: GraphQLInt,
      description: 'Errata ID.',
    },
    product_name: {
      type: GraphQLString,
      description: 'Product version. Example: RHEL-8.1.0.Z.E4S',
    },
    advisory_status: {
      type: GraphQLString,
      description: 'Advisory status. Example: SHIPPED_LIVE',
    },
    advisory_name: {
      type: GraphQLString,
      description: 'Advisory name. Example: RHBA-2022:7067-03',
    },
  }),
});

/* Put limit just to prevent DoS, with correct arguments there cannot be so much linked errata */
const mkTeiidQueryETLinkedAdvisories = (nvrs: string[]): string => {
  // https://www.postgresql.org/docs/current/sql-syntax-lexical.html
  // 4.1.2.1. String Constants
  const nvrsQuoted = _.map(nvrs, (nvr) => `'${_.replace(nvr, /'/g, "''")}'`);
  const qs = _.join(nvrsQuoted, ', ');
  const query = `
SELECT          
        c1.nvr, c1.id,
        c2.errata_id,
        c3.name,
        c4.status, c4.fulladvisory
FROM
        Errata_public.brew_builds c1,
        Errata_public.errata_brew_mappings c2,
        Errata_public.product_versions c3,
        Errata_public.errata_main c4
WHERE
        c1.nvr in (${qs})
        AND
        c1.id=c2.brew_build_id
        AND
        c2.product_version_id=c3.id
        AND
        c2.errata_id=c4.id
LIMIT 200
`;
  return query;
};

const TeiidETLinkedAdvisoriesMapping = {
  nvr: 'build_nvr',
  id: 'build_id',
  errata_id: 'advisory_id',
  name: 'product_name',
  status: 'advisory_status',
  fulladvisory: 'advisory_name',
};

export const teiidQueryETLinkedAdvisories: GraphQLFieldConfig<any, any> = {
  type: new GraphQLList(TeiidETLinkedAdvisories),
  args: {
    nvrs: {
      type: new GraphQLNonNull(new GraphQLList(GraphQLString)),
      description: 'List of NVRs you are interested in.',
    },
  },
  description: 'Returns a list of linked Errata for the build.',
  async resolve(_parentValue, args, _context, _info) {
    const { nvrs } = args;
    const client = await getTeiidClient();
    if (!client) {
      log(' [w] cannot init connection to Teiid. Continue running.');
      return;
    }
    const query = mkTeiidQueryETLinkedAdvisories(nvrs);
    const res = await client.query(query);
    if (!_.size(res.rows)) {
      log(' [i] Empty reply for query: %s', query);
      return;
    }
    const tranformed = _.map(res.rows, (row) =>
      _.mapKeys(
        row,
        (_v, key: keyof typeof TeiidETLinkedAdvisoriesMapping) =>
          TeiidETLinkedAdvisoriesMapping[key],
      ),
    );
    return tranformed;
  },
};
