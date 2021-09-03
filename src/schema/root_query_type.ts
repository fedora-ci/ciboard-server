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

import url from 'url';
import _ from 'lodash';
import zlib from 'zlib';
import util from 'util';
import axios from 'axios';
import debug from 'debug';
import { URL } from 'url';
import * as graphql from 'graphql';

import { getcfg, greenwave_cfg, waiverdb_cfg } from '../cfg';
import { mk_cursor, QueryOptions } from '../services/db';
import { koji_query } from '../services/kojibrew';

const cfg = getcfg();
const log = debug('osci:root_query_type');
const zlib_inflate = util.promisify(zlib.inflate);

const {
  GraphQLInt,
  GraphQLList,
  GraphQLString,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLObjectType,
  GraphQLInputObjectType,
} = graphql;

import {
  WaiverDBInfoType,
  WaiverDBConfigType,
  WaiverDBWaiverType,
  WaiverDBWaiversType,
} from './waiverdb_types';

import {
  CommitObject,
  commitObjFromRaw,
  commitObjFromGitLabApi,
  DistGitInstanceInputType,
  CommitObjectType,
  commitObjFromPagureApi,
} from './distgit_types';

import {
  GreenWaiveInfoType,
  GreenWaivePoliciesType,
  GreenWaiveDecisionType,
  GreenWaiveSubjectTypesType,
} from './greenwaive_types';

import { ArtifactsType } from './db_types';

import {
  KojiHistoryType,
  KojiTaskInfoType,
  KojiBuildInfoType,
  KojiBuildTagsType,
  KojiInstanceInputType,
} from './koji_types';

const GreenWaiveWaiverRuleInputType = new GraphQLInputObjectType({
  name: 'GreenWaiveWaiverRuleInputType',
  fields: () => ({
    type: { type: GraphQLString },
    test_case_name: { type: GraphQLString },
  }),
});

const GreenWaiveWaiverSubjectInputType = new GraphQLInputObjectType({
  name: 'GreenWaiveWaiverSubjectInputType',
  fields: () => ({
    item: { type: GraphQLString },
    type: { type: GraphQLString },
  }),
});

const ArtifactsOptionsInputType = new GraphQLInputObjectType({
  name: 'ArtifactsOptionsInputType',
  fields: () => ({
    skipScratch: { type: GraphQLBoolean },
  }),
});

const keys_translate = (ch1: string, ch2: string, obj: any) => {
  _.forEach(_.keys(obj), (key) => {
    if (_.includes(key, ch1)) {
      _.set(obj, _.replace(key, ch1, ch2), _.get(obj, key));
    }
  });
};

const splitAt = (index: number) => (x: any[]) =>
  [x.slice(0, index), x.slice(index)];

const RootQuery = new GraphQLObjectType({
  name: 'RootQueryType',
  fields: () => ({
    /**
     * Ping-pong
     */
    ping: {
      type: GraphQLString,
      resolve() {
        return 'pong';
      },
    },
    /**
     * WaiverDB
     */
    waiver_db_info: {
      type: WaiverDBInfoType,
      resolve() {
        if (!waiverdb_cfg?.url) {
          throw new Error('Waiverdb is not configured.');
        }
        return axios
          .get(waiverdb_cfg.about.api_url.toString())
          .then((x) => x.data);
      },
    },
    waiver_db_config: {
      type: WaiverDBConfigType,
      resolve() {
        if (!waiverdb_cfg?.url) {
          throw new Error('Waiverdb is not configured.');
        }
        return axios.get(waiverdb_cfg.config.api_url.toString()).then((x) => {
          const { superusers } = x.data;
          const permission_mapping = _.values(
            _.mapValues(x.data.permission_mapping, (value, key) => {
              value['testcase_regex'] = key;
              return value;
            })
          );
          return { superusers, permission_mapping };
        });
      },
    },
    waiver_db_waivers: {
      type: WaiverDBWaiversType,
      args: {
        page: { type: GraphQLInt },
        limit: { type: GraphQLInt },
        /**
         * Only include waivers for the given subject type.
         */
        subject_type: { type: GraphQLString },
        /**
         * Only include waivers for the given subject identifier.
         */
        subject_identifier: { type: GraphQLString },
        /**
         * Only include waivers for the given test case name.
         */
        testcase: { type: GraphQLString },
        /**
         * Only include waivers for the given product version.
         */
        product_version: { type: GraphQLString },
        /**
         * Only include waivers which were submitted by the given user.
         */
        username: { type: GraphQLString },
        /**
         * Only include waivers which were proxied on behalf of someone else by the given user.
         */
        proxied_by: { type: GraphQLString },
        /**
         * An ISO 8601 formatted datetime (e.g. 2017-03-16T13:40:05+00:00) to filter results by. Optionally provide a second ISO 8601 datetime separated by a comma to retrieve a range (e.g. 2017-03-16T13:40:05+00:00, 2017-03-16T13:40:15+00:00)
         */
        since: { type: GraphQLString },
        /**
         * If true, obsolete waivers will be included.
         */
        include_obsolete: { type: GraphQLBoolean },
      },
      resolve(parentValue, args) {
        if (!waiverdb_cfg?.url) {
          throw new Error('Waiverdb is not configured.');
        }
        const target_url = new URL(waiverdb_cfg.waivers.api_url.toString());
        _.forEach(args, (val, key) => target_url.searchParams.append(key, val));
        const turl = target_url.toString();
        log('Get %s', turl);
        return axios
          .get(turl)
          .then((x) => {
            log('Received waivers: %O', _.map(x.data.data, 'id'));
            const ret = {
              waivers: x.data.data,
              page_url_prev: x.data.prev,
              page_url_next: x.data.next,
              page_url_first: x.data.first,
              page_url_last: x.data.last,
            };
            return ret;
          })
          .catch((reason) => {
            log('Query failed: %s', reason);
            return reason;
          });
      },
    },
    waiver_db_waiver: {
      type: WaiverDBWaiverType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLInt) },
      },
      resolve(parentValue, { id }) {
        if (!waiverdb_cfg?.url) {
          throw new Error('Waiverdb is not configured.');
        }
        const target_url = new URL(
          `${id}`,
          waiverdb_cfg.waivers.api_url.toString()
        ).toString();
        return axios.get(target_url).then((x) => x.data);
      },
    },
    greenwaive_info: {
      type: GreenWaiveInfoType,
      resolve() {
        if (!greenwave_cfg?.url) {
          throw new Error('Greenwave is not configured.');
        }
        return axios
          .get(greenwave_cfg.about.api_url.toString())
          .then((x) => x.data);
      },
    },
    greenwaive_subject_types: {
      type: GreenWaiveSubjectTypesType,
      resolve() {
        if (!greenwave_cfg?.url) {
          throw new Error('Greenwave is not configured.');
        }
        return axios
          .get(greenwave_cfg.subject_types.api_url.toString())
          .then((x) => x.data);
      },
    },
    greenwaive_policies: {
      type: GreenWaivePoliciesType,
      resolve() {
        if (!greenwave_cfg?.url) {
          throw new Error('Greenwave is not configured.');
        }
        return axios
          .get(greenwave_cfg.policies.api_url.toString())
          .then((x) => x.data);
      },
    },
    greenwaive_decision: {
      type: GreenWaiveDecisionType,
      args: {
        subject_type: {
          type: GraphQLString,
          description:
            'The type of software artefact we are making a decision about, for example koji_build.',
        },
        product_version: {
          type: GraphQLString,
          description:
            'The product version string used for querying WaiverDB. Example: fedora-30',
        },
        decision_context: {
          type: GraphQLString,
          description:
            'The decision context string, identified by a free-form string label. It is to be named through coordination between policy author and calling application, for example bodhi_update_push_stable. Do not use this parameter with rules.',
        },
        subject_identifier: {
          type: GraphQLString,
          description:
            'A string identifying the software artefact we are making a decision about. The meaning of the identifier depends on the subject type.',
        },
        when: {
          type: GraphQLString,
          description:
            'A date (or datetime) in ISO8601 format. Greenwave will take a decision considering only results and waivers until that point in time. Use this to get previous decision disregarding a new test result or waiver.',
        },
        subject: {
          type: new GraphQLList(GreenWaiveWaiverSubjectInputType),
          description:
            'A list of items about which the caller is requesting a decision used for querying ResultsDB and WaiverDB. Each item contains one or more key-value pairs of ‘data’ key in ResultsDB API. For example, [{“type”: “koji_build”, “item”: “xscreensaver-5.37-3.fc27”}]. Use this for requesting decisions on multiple subjects at once. If used subject_type and subject_identifier are ignored.',
        },
        ignore_result: {
          type: new GraphQLList(GraphQLString),
          description:
            'A list of result ids that will be ignored when making the decision.',
        },
        ignore_waiver: {
          type: new GraphQLList(GraphQLString),
          description:
            'A list of waiver ids that will be ignored when making the decision.',
        },
        rules: {
          type: new GraphQLList(GreenWaiveWaiverRuleInputType),
          description:
            'A list of dictionaries containing the ‘type’ and ‘test_case_name’ of an individual rule used to specify on-demand policy. For example, [{“type”:”PassingTestCaseRule”, “test_case_name”:”dist.abicheck”}, {“type”:”RemoteRule”}]. Do not use this parameter along with decision_context.',
        },
      },
      resolve(parentValue, args) {
        if (!greenwave_cfg?.url) {
          throw new Error('Greenwave is not configured.');
        }
        const postQuery = { ...args };
        postQuery.verbose = true;
        log('Query greenwaive for decision: %o', postQuery);
        return axios
          .post(greenwave_cfg.decision.api_url.toString(), postQuery)
          .then((x) => x.data);
      },
    },
    /**
     * https://koji.fedoraproject.org/koji/api
     */
    koji_task: {
      type: KojiTaskInfoType,
      args: {
        task_id: {
          type: new GraphQLNonNull(GraphQLInt),
          description: 'Task id to lookup',
        },
        instance: {
          type: KojiInstanceInputType,
          description: 'Koji hub name',
          defaultValue: 'fedoraproject',
        },
      },
      async resolve(parentValue, args) {
        const { task_id, instance } = args;
        log('Query %s for getTaskInfo: %s', instance, task_id);
        const reply = await koji_query(instance, 'getTaskInfo', task_id);
        log('Koji reply: %o', reply);
        return reply;
      },
    },
    koji_build_history: {
      type: KojiHistoryType,
      args: {
        build_id: {
          type: new GraphQLNonNull(GraphQLInt),
          description: 'Build id to lookup',
        },
        instance: {
          type: KojiInstanceInputType,
          description: 'Koji hub name',
          defaultValue: 'fedoraproject',
        },
      },
      async resolve(parentValue, args) {
        const { build_id, instance } = args;
        log('Query %s for queryHistory. Build id : %s', instance, build_id);
        const reply = await koji_query(instance, 'queryHistory', {
          __starstar: true,
          build: build_id,
        });
        log('Koji reply: %o', reply);
        _.forEach(reply.tag_listing, _.partial(keys_translate, '.', '_'));
        return reply;
      },
    },
    koji_build: {
      type: KojiBuildInfoType,
      args: {
        build_id: {
          type: new GraphQLNonNull(GraphQLInt),
          description: 'Build id to lookup',
        },
        instance: {
          type: KojiInstanceInputType,
          description: 'Koji hub name',
          defaultValue: 'fedoraproject',
        },
      },
      async resolve(parentValue, args) {
        const { build_id, instance } = args;
        log('Query %s for getBuild. Build id : %s', instance, build_id);
        const reply = await koji_query(instance, 'getBuild', build_id);
        log('Koji reply: %o', reply);
        return reply;
      },
    },
    koji_build_tags: {
      type: new GraphQLList(KojiBuildTagsType),
      args: {
        build_id: {
          type: new GraphQLNonNull(GraphQLInt),
          description: 'Build id to lookup',
        },
        instance: {
          type: KojiInstanceInputType,
          description: 'Koji hub name',
          defaultValue: 'fedoraproject',
        },
      },
      async resolve(parentValue, args) {
        const { build_id, instance } = args;
        log('Query %s for getBuild. Build id : %s', instance, build_id);
        const reply = await koji_query(instance, 'listTags', build_id);
        log('Koji reply: %o', reply);
        return reply;
      },
    },
    distgit_commit: {
      /**
       * Inspired by: https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols
       */
      type: CommitObject,
      args: {
        repo_name: {
          type: new GraphQLNonNull(GraphQLString),
          description: 'Repo name.',
        },
        namespace: {
          type: GraphQLString,
          description: 'Namespace: rpms, modules, containers,...',
          defaultValue: 'rpms',
        },
        commit_sha1: {
          type: new GraphQLNonNull(GraphQLString),
          description: 'Commit SHA1 to lookup',
        },
        instance: {
          type: DistGitInstanceInputType,
          description: 'Dist-git name',
          defaultValue: 'fp',
        },
      },
      async resolve(parentValue, args) {
        /**
         * https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt
         */
        const { commit_sha1, repo_name, namespace, instance } = args;
        log(
          'Query %s dist-git %s/%s:%s',
          instance,
          namespace,
          repo_name,
          commit_sha1
        );
        const [dir, file] = splitAt(2)(commit_sha1);
        var url;
        var commit_obj: CommitObjectType;
        if (instance === 'rh') {
          url = `${cfg.distgit.rh.base_url}/cgit/${namespace}/${repo_name}/objects/${dir}/${file}`;
          const reply = await axios.get(url, {
            responseType: 'arraybuffer',
          });
          const commit_obj_raw = await zlib_inflate(reply.data);
          commit_obj = commitObjFromRaw(commit_obj_raw);
        }
        if (instance === 'cs') {
          const project_path = encodeURIComponent(
            `redhat/centos-stream/${namespace}/${repo_name}`
          );
          url = `${cfg.distgit.cs.base_url_api}/${project_path}/repository/commits/${commit_sha1}`;
          const reply = await axios.get(url);
          commit_obj = commitObjFromGitLabApi(reply.data);
        }
        if (instance === 'fp') {
          url = `${cfg.distgit.fp.base_url_api}/${namespace}/${repo_name}/c/${commit_sha1}/info`;
          const reply = await axios.get(url);
          commit_obj = commitObjFromPagureApi(reply.data);
        } else {
          return {};
        }
        log(
          'Reply %s dist-git %s/%s:%s commit-object:%s%o',
          instance,
          namespace,
          repo_name,
          commit_sha1,
          '\n',
          commit_obj
        );
        return commit_obj;
      },
    },
    db_artifacts: {
      type: ArtifactsType,
      args: {
        aid_offset: {
          type: GraphQLString,
          description: 'Artifact ID to start lookup from. Not inclusive.',
        },
        limit: {
          type: GraphQLInt,
          description: 'Return no more then requested number.',
        },
        atype: {
          type: new GraphQLNonNull(GraphQLString),
          description:
            'The type of artefact, one of: brew-build, koji_build, copr-build, redhat-module, productmd-compose.',
        },
        dbFieldName: {
          type: GraphQLString,
          description: 'Name of field in DB .',
        },
        dbFieldValues: {
          type: new GraphQLList(GraphQLString),
          description:
            'List of artifact values for dbFieldName. For example: if dbFieldName=="aid" than: taskID for brew-build and koji_build, mbs id for redhat-module.',
        },
        regexs: {
          type: new GraphQLList(GraphQLString),
          description: 'List of artifact names in regex form.',
        },
        options: {
          type: ArtifactsOptionsInputType,
          description: 'A list of options that impacts on search results.',
        },
      },
      async resolve(parentValue, args, context, info) {
        var has_next = false;
        const args_default = {
          /**
           * limit works only for regex, and is ignored for set of specific aid.
           */
          limit: cfg.db.limit_default,
          options: {},
        };
        const args_with_default: QueryOptions = _.defaultsDeep(
          args,
          args_default
        );
        const { atype, limit } = args_with_default;
        const add_path: string[][] = [];
        log('Requested: %o', args_with_default);
        const cursor = await mk_cursor(args_with_default);
        const artifacts = await cursor.toArray();
        // close() is promise, ignore result
        cursor.close();
        log(
          ' [i] fetched artifacts of type %s aids: %o',
          atype,
          _.map(artifacts, 'aid')
        );
        _.forEach(artifacts, (artifact) =>
          _.forEach(add_path, ([pathold, pathnew]) =>
            _.set(artifact, pathnew, _.get(artifact, pathold))
          )
        );
        /**
         * Check if has next for query:
         */
        if (artifacts.length && artifacts.length === limit) {
          const aid_offset = _.last(artifacts)?.aid;
          /**
           * Check if has_more for regex case
           */
          const args = {
            ...args_with_default,
            limit: 1,
            aid_offset,
          };
          const cursor = await mk_cursor(args);
          const artifact_next = await cursor.toArray();
          has_next = artifact_next.length ? true : false;
          log('aid_offset == %s, has_next == %s', aid_offset, has_next);
          /**
           * close() is promise, ignore result
           */
          cursor.close();
        }
        log('XXX %O', artifacts);
        return {
          artifacts,
          has_next,
        };
      },
    },
  }),
});

export default RootQuery;
