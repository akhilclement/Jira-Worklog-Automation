const axios = require('axios');

class JiraService {
    constructor() {
        this.baseURL = `https://${process.env.JIRA_HOST}`;
        this.auth = {
            username: process.env.JIRA_USERNAME,
            password: process.env.JIRA_API_TOKEN
        };
    }

    async searchJira(jql, options = {}) {
        try {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/rest/api/3/search`,
                auth: this.auth,
                params: {
                    jql,
                    maxResults: options.maxResults || 1000,
                    fields: options.fields?.join(',') || 'summary,worklog'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error searching Jira:', error.response?.data || error.message);
            throw error;
        }
    }

    async getIssueWorklogs(issueKey) {
        try {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/rest/api/3/issue/${issueKey}/worklog`,
                auth: this.auth
            });
            return response.data;
        } catch (error) {
            console.error('Error getting issue worklogs:', error.response?.data || error.message);
            throw error;
        }
    }

    async searchUsers(options = {}) {
        try {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/rest/api/3/users/search`,
                auth: this.auth,
                params: {
                    maxResults: options.maxResults || 1000,
                    query: options.query || '',
                    accountId: options.accountId
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error searching users:', error.response?.data || error.message);
            throw error;
        }
    }

    async getGroupMembers(groupName) {
        try {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}/rest/api/3/group/member`,
                auth: this.auth,
                params: {
                    groupname: groupName,
                    maxResults: 1000
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting group members:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new JiraService();