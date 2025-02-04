const JiraApi = require('jira-client');
const nodemailer = require('nodemailer');

// Initialize JIRA client
const jira = new JiraApi({
    protocol: 'https',
    host: process.env.JIRA_HOST,
    username: process.env.JIRA_USERNAME,
    password: process.env.JIRA_API_TOKEN,
    apiVersion: '2',
    strictSSL: true
});

// Email transporter configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587, // Changed to use TLS port
    secure: false, // Changed to false for TLS
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
    }
});

// Verify SMTP connection
transporter.verify(function(error, success) {
    if (error) {
        console.log('SMTP connection error:', error);
    } else {
        console.log('SMTP server is ready');
    }
});

class WorklogController {
    async fetchWorklogs(date) {
        try {
            const jqlQuery = `worklogDate = "${date}" ORDER BY updated DESC`;
            const issues = await jira.searchJira(jqlQuery);
            
            let worklogsByUser = {};
            
            for (const issue of issues.issues) {
                const worklog = await jira.getIssueWorklogs(issue.key);
                const filteredWorklogs = worklog.worklogs.filter(log => 
                    new Date(log.started).toDateString() === new Date(date).toDateString()
                );
                
                filteredWorklogs.forEach(log => {
                    const userId = log.author.displayName;
                    if (!worklogsByUser[userId]) {
                        worklogsByUser[userId] = [];
                    }
                    worklogsByUser[userId].push({
                        issueKey: issue.key,
                        summary: issue.fields.summary,
                        timeSpent: log.timeSpentSeconds,
                        comment: log.comment,
                        started: log.started
                    });
                });
            }
            
            return worklogsByUser;
        } catch (error) {
            console.error('Error fetching worklogs:', error);
            throw error;
        }
    }

    createEmailContent(worklogsByUser) {
        let html = `
            <h1>Daily Worklog Report</h1>
            <style>
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
                th { background-color: #f2f2f2; }
                .total-row { font-weight: bold; background-color: #f9f9f9; }
                ul { margin: 0; padding-left: 20px; }
                .low-hours { color: red; font-weight: bold; }
            </style>
            <table>
                <tr>
                    <th>User</th>
                    <th>Tasks</th>
                    <th>Total Hours</th>
                </tr>
        `;
        
        // Convert to array and calculate totals for sorting
        const userEntries = Object.entries(worklogsByUser).map(([user, worklogs]) => {
            const totalHours = worklogs.reduce((sum, log) => sum + (log.timeSpent / 3600), 0);
            return { user, worklogs, totalHours };
        });

        // Sort by total hours ascending
        userEntries.sort((a, b) => a.totalHours - b.totalHours);
        
        userEntries.forEach(({ user, worklogs, totalHours }) => {
            html += '<tr><td>' + user + '</td><td><ul>';
            
            worklogs.forEach(log => {
                const timeSpentHours = log.timeSpent / 3600;
                html += `<li>${log.summary} [${timeSpentHours.toFixed(2)}]</li>`;
            });
            
            const totalHoursClass = totalHours < 8 ? 'class="low-hours"' : '';
            html += `</ul></td><td ${totalHoursClass}>${totalHours.toFixed(2)}</td></tr>`;
        });
        
        html += '</table>';
        return html;
    }

    async sendWorklogEmail(date) {
        const worklogs = await this.fetchWorklogs(date);
        const htmlContent = this.createEmailContent(worklogs);
        
        const emailData = {
            from: {
                name: 'JIRA Worklog Report',
                address: process.env.EMAIL_FROM_ADDRESS
            },
            to: process.env.RECIPIENT_EMAIL,
            // cc: process.env.CC_EMAIL ? process.env.CC_EMAIL.split(',') : [],
            subject: `Daily Worklog Report - ${date}`,
            html: htmlContent
        };

        await transporter.sendMail(emailData);
    }

    async fetchWeeklyWorklogs(startDate, endDate) {
        try {
            console.log(`Fetching worklogs between ${startDate} and ${endDate}`);
            
            // Modify JQL to get all issues with worklogs in the date range
            const jqlQuery = `worklogDate >= "${startDate}" AND worklogDate <= "${endDate}"`;
            console.log('JQL Query:', jqlQuery);
            
            const issues = await jira.searchJira(jqlQuery, {
                maxResults: 1000,
                fields: ['summary', 'worklog']
            });
            
            console.log(`Found ${issues.total} issues`);
            let worklogsByUser = {};
            
            // Initialize default users
          
            for (const issue of issues.issues) {
                console.log(`Processing issue: ${issue.key}`);
                const worklog = await jira.getIssueWorklogs(issue.key);
                console.log(`Found ${worklog.worklogs.length} worklogs for ${issue.key}`);
                
                const filteredWorklogs = worklog.worklogs.filter(log => {
                    const logDate = new Date(log.started);
                    const startDateObj = new Date(startDate);
                    const endDateObj = new Date(endDate);
                    
                    // Set time to start and end of day for accurate comparison
                    startDateObj.setHours(0, 0, 0, 0);
                    endDateObj.setHours(23, 59, 59, 999);
                    
                    const isInRange = logDate >= startDateObj && logDate <= endDateObj;
                    if (isInRange) {
                        console.log(`Valid worklog found for ${log.author.displayName} on ${logDate.toLocaleDateString()}`);
                    }
                    return isInRange;
                });
                
                filteredWorklogs.forEach(log => {
                    const userId = log.author.displayName;
                    if (!worklogsByUser[userId]) {
                        worklogsByUser[userId] = [];
                    }
                    worklogsByUser[userId].push({
                        issueKey: issue.key,
                        summary: issue.fields.summary,
                        timeSpent: log.timeSpentSeconds,
                        comment: log.comment,
                        started: log.started
                    });
                });
            }
            
            console.log('Final worklogsByUser:', {
                users: Object.keys(worklogsByUser),
                totalEntries: Object.values(worklogsByUser).flat().length
            });
            
            return worklogsByUser;
        } catch (error) {
            console.error('Error fetching weekly worklogs:', error);
            throw error;
        }
    }

    createWeeklyEmailContent(worklogsByUser, startDate, endDate) {
        let html = `
            <h1>Weekly Worklog Summary (${startDate} to ${endDate})</h1>
            <style>
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
                th { background-color: #f2f2f2; }
                .total-row { font-weight: bold; background-color: #f9f9f9; }
                ul { margin: 0; padding-left: 20px; }
                .low-hours { color: red; font-weight: bold; }
            </style>
            <table>
                <tr>
                    <th>User</th>
                    <th>Tasks</th>
                    <th>Total Hours</th>
                </tr>
        `;
        
        const userEntries = Object.entries(worklogsByUser).map(([user, worklogs]) => {
            const totalHours = worklogs.reduce((sum, log) => sum + (log.timeSpent / 3600), 0);
            return { user, worklogs, totalHours };
        });

        userEntries.sort((a, b) => a.totalHours - b.totalHours);
        
        userEntries.forEach(({ user, worklogs, totalHours }) => {
            const weeklyTarget = 40; // 8 hours * 5 days
            const totalHoursClass = totalHours < weeklyTarget ? 'class="low-hours"' : '';
            
            html += '<tr><td>' + user + '</td><td><ul>';
            
            worklogs.forEach(log => {
                const timeSpentHours = log.timeSpent / 3600;
                const date = new Date(log.started).toLocaleDateString();
                html += `<li>${date} - ${log.summary} [${timeSpentHours.toFixed(2)}]</li>`;
            });
            
            html += `</ul></td><td ${totalHoursClass}>${totalHours.toFixed(2)}</td></tr>`;
        });
        
        html += '</table>';
        return html;
    }

    async sendWeeklyWorklogEmail(startDate, endDate) {
        const worklogs = await this.fetchWeeklyWorklogs(startDate, endDate);
        const htmlContent = this.createWeeklyEmailContent(worklogs, startDate, endDate);
        
        const emailData = {
            from: {
                name: 'JIRA Worklog Report',
                address: process.env.EMAIL_FROM_ADDRESS
            },
            to: process.env.RECIPIENT_EMAIL,
            // cc: process.env.CC_EMAIL ? process.env.CC_EMAIL.split(',') : [],
            subject: `Weekly Worklog Summary - ${startDate} to ${endDate}`,
            html: htmlContent
        };

        await transporter.sendMail(emailData);
    }
}

module.exports = new WorklogController();