/*
 * This file is part of ciboard-server

 * Copyright (c) 2024 Andrei Stepanov <astepano@redhat.com>
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
import { GraphQLFieldConfig, GraphQLScalarType } from 'graphql';
import axios from 'axios';
const { GraphQLNonNull, GraphQLString, GraphQLObjectType } = graphql;

import { getcfg } from '../cfg';
import GraphQLJSON  from 'graphql-type-json';
const cfg = getcfg();

const debug = require('debug');
const log = debug('osci:gitlab_types');

/**
 * GitLab API commit reply:
 * 
 * https://docs.gitlab.com/ee/api/commits.html#get-a-single-commit
 *
 * {
 *   "id": "6faa892b04c6704c0a9db9521c5e1e38b6e1e2b2",
 *   "short_id": "6faa892b",
 *   "created_at": "2021-08-09T19:28:18.000+00:00",
 *   "parent_ids": [
 *     "66f2dd6994df776bde92d9da04e86404ba054bb7"
 *   ],
 *   "title": "Rebuilt for IMA sigs, glibc 2.34, aarch64 flags",
 *   "message": "Rebuilt for IMA sigs, glibc 2.34, aarch64 flags\n\nRelated: rhbz#1991688\nSigned-off-by: Mohan Boddu <...>\n",
 *   "author_name": "Mohan Boddu",
 *   "author_email": "...",
 *   "authored_date": "2021-08-09T19:28:18.000+00:00",
 *   "committer_name": "Mohan Boddu",
 *   "committer_email": "...",
 *   "committed_date": "2021-08-09T19:28:18.000+00:00",
 *   "trailers": {},
 *   "web_url": "https://gitlab.com/redhat/centos-stream/rpms/bash/-/commit/6faa892b04c6704c0a9db9521c5e1e38b6e1e2b2",
 *   "stats": {
 *     "additions": 5,
 *     "deletions": 1,
 *     "total": 6
 *   },
 *   "status": null,
 *   "project_id": 23656762,
 *   "last_pipeline": null
 * }
 */

export type GitlabApiCommitType = {
  id: string;
  short_id: string;
  created_at: string;
  parent_ids: string[];
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  trailers: {};
  web_url: string;
  stats: {
    additions: number;
    deletions: number;
    total: number;
  };
  status: null;
  project_id: number;
  last_pipeline: null;
};

// GraphQLJSON is GraphQLScalarType

export const GitlabCommitType = new GraphQLScalarType({
  name: 'GitlabCommitType',
  description: 'Custom scalar type representing Gitlab commit data',
  serialize: GraphQLJSON.serialize,
  parseValue: GraphQLJSON.parseValue,
  parseLiteral: GraphQLJSON.parseLiteral,
});

export const GitlabCommitMrType = new GraphQLScalarType({
  name: 'GitlabCommitMrType',
  description: 'Custom scalar type representing Gitlab commit MR data',
  serialize: GraphQLJSON.serialize,
  parseValue: GraphQLJSON.parseValue,
  parseLiteral: GraphQLJSON.parseLiteral,
});

// Query for information on a specific commit in the GitLab.
export const queryGitlabCommit: GraphQLFieldConfig<any, any> = {
  type: GitlabCommitType,
  description: "Returns: https://docs.gitlab.com/ee/api/commits.html#get-a-single-commit",
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
  },
  async resolve(_parentValue, args) {
    const { commit_sha1, repo_name, namespace } = args;
    log(
      'Query for commit info %s dist-git %s/%s:%s',
      namespace,
      repo_name,
      commit_sha1,
    );
    var url;
    const projectPath = encodeURIComponent(
      `redhat/centos-stream/${namespace}/${repo_name}`,
    );
    url = `${cfg.distgit.cs.base_url_api}/${projectPath}/repository/commits/${commit_sha1}`;
    const reply = await axios.get(url);
    const apiReply = reply.data;
    if (_.isUndefined(apiReply)) {
      return {};
    }
    return apiReply;
  },
};

// Query for MR information on a specific commit in the GitLab.
export const queryGitlabCommitMr: GraphQLFieldConfig<any, any> = {
  type: GitlabCommitMrType,
  description: "Returns: https://docs.gitlab.com/ee/api/commits.html#list-merge-requests-associated-with-a-commit",
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
  },
  async resolve(_parentValue, args) {
    const { commit_sha1, repo_name, namespace } = args;
    log(
      'Query for MR info %s dist-git %s/%s:%s',
      namespace,
      repo_name,
      commit_sha1,
    );
    var url;
    const projectPath = encodeURIComponent(
      `redhat/centos-stream/${namespace}/${repo_name}`,
    );
    url = `${cfg.distgit.cs.base_url_api}/${projectPath}/repository/commits/${commit_sha1}/merge_requests`;
    let reply;
    try {
      reply = await axios.get(url);
    } catch (err) {
      if (_.isError(err)) {
        log(' [w] cannot get Gitlab info for %s : %s', url, err.message);
        return;
      } else {
        throw err;
      }
    }
    const apiReply = reply.data;
    if (_.isUndefined(apiReply)) {
      return {};
    }
    return apiReply;
  },
};