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
import * as graphql from 'graphql';

const { GraphQLList, GraphQLString, GraphQLObjectType } = graphql;

const debug = require('debug');
const log = debug('osci:db_types');

// XXX remove ?
//const StateCiType = new GraphQLObjectType({
//  name: 'StateCiType',
//  fields: () => ({
//    irc: { type: GraphQLString },
//    url: { type: GraphQLString },
//    name: { type: GraphQLString },
//    team: { type: GraphQLString },
//    email: { type: GraphQLString },
//  }),
//});

// XXX remove ?
//const StateContactType = new GraphQLObjectType({
//  name: 'StateContactType',
//  fields: () => ({
//    irc: { type: GraphQLString },
//    url: { type: GraphQLString },
//    docs: { type: GraphQLString },
//    name: { type: GraphQLString },
//    team: { type: GraphQLString },
//    email: { type: GraphQLString },
//    version: { type: GraphQLString },
//  }),
//});

// XXX remove ?
//const StateSystemType = new GraphQLObjectType({
//  name: 'StateSystemType',
//  fields: () => ({
//    os: { type: GraphQLString },
//    label: { type: GraphQLString },
//    provider: { type: GraphQLString },
//    architecture: { type: GraphQLString },
//  }),
//});

// XXX remove ?
//const StatePipelineType = new GraphQLObjectType({
//  name: 'StatePipelineType',
//  fields: () => ({
//    id: { type: GraphQLString },
//    name: { type: GraphQLString },
//    build: { type: GraphQLString },
//    stage: { type: GraphQLString },
//  }),
//});

// XXX remove  ?
//const StateRunAdditinalInfoType = new GraphQLObjectType({
//  name: 'StateRunAdditinalInfoType',
//  fields: () => ({
//    module: { type: GraphQLString },
//    actual_module: { type: GraphQLString },
//    additional_info: { type: new GraphQLList(GraphQLString) },
//  }),
//});

// XXX remove ?
//const StateRunType = new GraphQLObjectType({
//  name: 'StateRunType',
//  fields: () => ({
//    log: { type: GraphQLString },
//    url: { type: GraphQLString },
//    debug: { type: GraphQLString },
//    rebuild: { type: GraphQLString },
//    log_raw: { type: GraphQLString },
//    log_stream: { type: GraphQLString },
//    trigger_rebuild: { type: GraphQLString },
//    additional_info: {
//      type: new GraphQLList(StateRunAdditinalInfoType),
//    },
//  }),
//});

/**
 * https://pagure.io/fedora-ci/messages/blob/master/f/schemas/error.yaml
 */
// XXX remove ?
//const StateErrorType = new GraphQLObjectType({
//  name: 'StateErrorType',
//  fields: () => ({
//    reason: { type: GraphQLString },
//    issue_url: { type: GraphQLString },
//  }),
//});

//const StateTestType = new GraphQLObjectType({
//  name: 'StateTestType',
//  fields: () => ({
//    type: { type: GraphQLString },
//    docs: { type: GraphQLString },
//    note: { type: GraphQLString },
//    result: { type: GraphQLString },
//    category: { type: GraphQLString },
//    namespace: { type: GraphQLString },
//  }),
//});

//const StateArtifactType = new GraphQLObjectType({
//  name: 'StateArtifactType',
//  fields: () => ({
//    id: { type: GraphQLString },
//    nvr: { type: GraphQLString },
//    type: { type: GraphQLString },
//    branch: { type: GraphQLString },
//    issuer: { type: GraphQLString },
//    source: { type: GraphQLString },
//    scratch: { type: GraphQLString },
//    component: { type: GraphQLString },
//  }),
//});

// const ArtifactStateStatusType = new GraphQLObjectType({
//     name: 'ArtifactStateStatusType',
//     fields: () => ({
//         size: { type: GraphQLInt },
//         info: { type: GraphQLInt },
//         failed: { type: GraphQLInt },
//         passed: { type: GraphQLInt },
//         unknown: { type: GraphQLInt },
//         not_applicable: { type: GraphQLInt },
//         needs_inspection: { type: GraphQLInt },
//     }),
// });

// const ArtifactCurrentStateLenghtsType = new GraphQLObjectType({
//     name: 'ArtifactCurrentStateLenghtsType',
//     fields: () => ({
//         error: { type: ArtifactStateStatusType },
//         queued: { type: ArtifactStateStatusType },
//         waived: { type: ArtifactStateStatusType },
//         running: { type: ArtifactStateStatusType },
//         complete: { type: ArtifactStateStatusType },
//     }),
// });

export interface UserSamlType {
  /* astepano@ ... */
  nameID: string;
  /* Andrei Stepanov */
  displayName: string;
  /* ['splunk-misc-posix', 'osci', ...] */
  Role: string[];
}
