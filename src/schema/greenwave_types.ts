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
import {
  ArtifactModel,
  TSearchable,
  isArtifactBrewBuild,
  isArtifactRedHatContainerImage,
  isArtifactRedHatModule,
} from '../services/db_interface';

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

export const getGreenwaveDecisionContext = (
  artifact: TSearchable,
): GreenwaveContext | undefined => {
  if (isArtifactBrewBuild(artifact)) {
    return 'osci_compose_gate';
  } else if (isArtifactRedHatModule(artifact)) {
    return 'osci_compose_gate_modules';
  }
};

type GreenwaveRuleType = {
  type: string;
  test_case_name?: string;
};

export const getGreenwaveRules = (
  artifact: TSearchable,
): GreenwaveRuleType[] => {
  if (isArtifactRedHatContainerImage(artifact)) {
    /*
     * https://issues.redhat.com/browse/RHELWF-7827
     * https://code.engineering.redhat.com/gerrit/plugins/gitiles/errata-rails/+/refs/heads/master/lib/brew/import/builds.rb#57
     * https://code.engineering.redhat.com/gerrit/plugins/gitiles/errata-rails/+/refs/heads/master/config/initializers/settings.rb#524
     */
    /** XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX */
    if (
      _.includes((artifact as any).payload.osbs_subtypes, 'operator_bundle')
    ) {
      return [
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-metadata-preparation-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-metadata-linting-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-packagename-uniqueness-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-catalog-initialization-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-valid-subscriptions-bundle-image',
        },
        {
          type: 'RemoteRule',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-version-format-bundle-image',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name:
            'cvp.redhat.detailed.operator-olm-deployment-bundle-image',
        },
      ];
    } else {
      return [
        {
          type: 'PassingTestCaseRule',
          test_case_name: 'cvp.rhproduct.default.sanity',
        },
        {
          type: 'PassingTestCaseRule',
          test_case_name: 'cvp.rhproduct.default.functional',
        },
        {
          type: 'RemoteRule',
        },
      ];
    }
  }
  return [];
};

export type GreenwaveContext =
  | 'osci_compose_gate'
  | 'osci_compose_gate_modules'
  | 'cvp_default'
  | 'cvp_redhat_operator_default';

export const greenwave = {
  decision: {
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
        case 'redhat-container-image':
          return 'cvp';
        default:
          log('Cannot construct product verstion for', nvr, artifactType);
          return 'unknown_product_version';
      }
    },
  },
};
