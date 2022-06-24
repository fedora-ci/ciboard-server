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

import * as graphql from 'graphql';
import debug from 'debug';
import { getOSVersionFromNvr, getOSVersionFromTag } from '../services/misc';
import { GraphQLJSON } from 'graphql-type-json';
import _ from 'lodash';

const log = debug('osci:greenwave_types');
const {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLBoolean,
  GraphQLInt,
} = graphql;

export const GreenwaveInfoType = new GraphQLObjectType({
  name: 'GreenwaveInfoType',
  fields: () => ({
    version: { type: GraphQLString },
  }),
});

export const GreenwaveDecisionType = new GraphQLObjectType({
  name: 'GreenwaveDecisionType',
  fields: () => ({
    policies_satisfied: { type: GraphQLBoolean },
    summary: { type: GraphQLString },
    satisfied_requirements: {
      type: new GraphQLList(GraphQLJSON),
    },
    unsatisfied_requirements: {
      type: new GraphQLList(GraphQLJSON),
    },
    results: {
      type: new GraphQLList(GraphQLJSON),
    },
    waivers: {
      type: new GraphQLList(GraphQLJSON),
    },
  }),
});

export const GreenwaveSubjectTypesType = new GraphQLObjectType({
  name: 'GreenWaiveSubjectTypesType',
  description: 'Returns all currently loaded subject_types',
  fields: () => ({
    subject_types: {
      type: new GraphQLList(GreenwaveSubjectTypeType),
    },
  }),
});

export const GreenwaveSubjectTypeType = new GraphQLObjectType({
  name: 'GreenwaveSubjectTypeType',
  description: 'Return loaded subject type entry',
  fields: () => ({
    aliases: {
      type: new GraphQLList(GraphQLString),
    },
    id: {
      type: GraphQLString,
    },
    ignore_missing_policy: {
      type: GraphQLBoolean,
    },
    is_koji_build: {
      type: GraphQLBoolean,
    },
    is_nvr: {
      type: GraphQLBoolean,
    },
    item_key: {
      type: GraphQLString,
    },
    product_version: {
      type: GraphQLString,
    },
    result_queries: {
      type: new GraphQLList(
        new GraphQLObjectType({
          name: 'GreenwaveSubjectTypeItemResultQueriesType',
          fields: {
            item_key: { type: GraphQLString },
            keys: {
              type: new GraphQLObjectType({
                name: 'GreenwaveSubjectTypeItemResultQueriesTypeType',
                fields: {
                  type: { type: GraphQLString },
                },
              }),
            },
          },
        }),
      ),
    },
    supports_remote_rule: {
      type: GraphQLBoolean,
    },
    item_dict: {
      type: new GraphQLObjectType({
        name: 'GreenwaveSubjectTypeItemDictType',
        fields: { item_key: { type: GraphQLString } },
      }),
    },
  }),
});

export const GreenwavePolicyType = new GraphQLObjectType({
  name: 'GreenwavePolicyType',
  description: 'Returns policy entry.',
  fields: () => ({
    id: { type: GraphQLString },
    subject_type: { type: GraphQLString },
    relevance_key: { type: GraphQLString },
    relevance_value: { type: GraphQLString },
    decision_context: { type: GraphQLString },
    blacklist: {
      type: new GraphQLList(GraphQLString),
    },
    excluded_packages: {
      type: new GraphQLList(GraphQLString),
    },
    packages: {
      type: new GraphQLList(GraphQLString),
    },
    product_versions: {
      type: new GraphQLList(GraphQLString),
    },
    rules: {
      type: new GraphQLList(
        new GraphQLObjectType({
          name: 'GreenwavePolicyRuleType',
          fields: {
            rule: { type: GraphQLString },
            scenario: { type: GraphQLString },
            test_case_name: { type: GraphQLString },
          },
        }),
      ),
    },
  }),
});

export const GreenwavePoliciesType = new GraphQLObjectType({
  name: 'GreenwavePoliciesType',
  description: 'Returns all currently loaded policies.',
  fields: () => ({
    policies: {
      type: new GraphQLList(GreenwavePolicyType),
    },
  }),
});

export const greenwave = {
  decision: {
    context: {
      'brew-build': 'osci_compose_gate',
      'redhat-module': 'osci_compose_gate_modules',
      'redhat-container': 'cvp_default',
    },
    product_version: (
      nvr: string,
      gate_tag_name: string | undefined,
      artifactType: string,
    ) => {
      const rhel_version_from_tag = getOSVersionFromTag(gate_tag_name);
      const rhel_version_from_nvr = getOSVersionFromNvr(nvr, artifactType);
      const rhel_version = _.chain([
        rhel_version_from_tag,
        rhel_version_from_nvr,
      ])
        .compact()
        .first()
        .value();
      switch (artifactType) {
        case 'brew-build':
          return `rhel-${rhel_version}`;
        case 'redhat-module':
          return `rhel-${rhel_version}`;
        case 'redhat-container':
          return 'cvp';
        default:
          log('Cannot construct product verstion for', nvr, artifactType);
          return 'unknown_product_version';
      }
    },
  },
};

export type GreenwaveContextType =
  keyof typeof greenwave['decision']['context'];
