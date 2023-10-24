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

import _ from 'lodash';
import debug from 'debug';
import * as graphql from 'graphql';

const { GraphQLString, GraphQLObjectType } = graphql;

import { getcfg } from '../cfg';
import {
  queryWaiverDbInfo,
  queryWaiverDbWaiver,
  queryWaiverDbWaivers,
  queryWaiverDbPermissions,
} from './waiverdb';
import { queryDistGitCommit } from './distgit_types';
import { querySstInfo, querySstList, querySstResults } from './sst_types';
import {
  queryKojiTask,
  queryKojiBuild,
  queryKojiBuildTags,
  queryKojiBuildHistory,
  queryKojiBuildTagsByNvr,
  queryKojiBuildHistoryByNvr,
} from './koji_types';
import { queryMbsBuild } from './mbs_types';
import { teiidQueryETLinkedAdvisories } from './teiid';
import { getArtifacts, artifactChildren } from './artifacts';
import {
  metadataRaw,
  queryAuthzMapping,
  metadataConsolidated,
} from './metadata';
import {
  queryGreenwaveInfo,
  queryGreenwavePolicies,
  queryGreenwaveDecision,
  queryGreenwaveSubjectTypes,
} from './greenwave_types';
import _static from '../routes/static';

const log = debug('osci:root_query_type');
const cfg = getcfg();

const RootQuery = new GraphQLObjectType({
  name: 'RootQueryType',
  fields: () =>
    _.assign<
      graphql.GraphQLFieldConfigMap<any, any>,
      graphql.GraphQLFieldConfigMap<any, any>
    >(
      {
        /**
         * Ping-pong
         */
        ping: {
          type: GraphQLString,
          resolve() {
            return 'pong';
          },
        },
      },
      {
        // Artifacts
        artifacts: getArtifacts,
        artifactChildren: artifactChildren,
        // Metadata
        metadataRaw: metadataRaw,
        authzMapping: queryAuthzMapping,
        metadataConsolidated: metadataConsolidated,
        // Teiid
        teiidEtLinkedAdvisories: teiidQueryETLinkedAdvisories,
        // Dist-git
        distgitCommit: queryDistGitCommit,
        // WaiverDb
        waiverDbInfo: queryWaiverDbInfo,
        waiverDbWaiver: queryWaiverDbWaiver,
        waiverDbWaivers: queryWaiverDbWaivers,
        waiverDbPermissions: queryWaiverDbPermissions,
        // Mbs
        mbsBuild: queryMbsBuild,
        // Koji
        kojiTask: queryKojiTask,
        kojiBuild: queryKojiBuild,
        kojiBuildTags: queryKojiBuildTags,
        kojiBuildHistory: queryKojiBuildHistory,
        kojiBuildTagsByNvr: queryKojiBuildTagsByNvr,
        kojiBuildHistoryByNvr: queryKojiBuildHistoryByNvr,
        // Greenwave
        greenwaveInfo: queryGreenwaveInfo,
        greenwaveDecision: queryGreenwaveDecision,
        greenwavePolicies: queryGreenwavePolicies,
        greenwaveSubjectTypes: queryGreenwaveSubjectTypes,
        // SST
        sstList: querySstList,
        sstInfo: querySstInfo,
        sstResults: querySstResults,
      },
    ),
});

export default RootQuery;
