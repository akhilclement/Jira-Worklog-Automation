const nodemailer = require('nodemailer');
const jiraService = require('../services/jiraService');
const userList = require('../services/userList.json');

// Email transporter configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: 587,
    secure: false,
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
            const targetDate = new Date(date);
            targetDate.setDate(targetDate.getDate() - 2); // Subtract 2 days
            const formattedDate = targetDate.toISOString().split('T')[0];

            const jqlQuery = `worklogDate = "${formattedDate}" ORDER BY updated DESC`;
            const issues = await jiraService.searchJira(jqlQuery);
            
            let worklogsByUser = {};
            
            for (const issue of issues.issues) {
                const worklog = await jiraService.getIssueWorklogs(issue.key);
                const filteredWorklogs = worklog.worklogs.filter(log => {
                    const logDate = new Date(log.started).toISOString().split('T')[0];
                    return logDate === formattedDate;
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

    async fetchUserWorklogs(startDate, endDate, accountId) {
        try {
            const jqlQuery = `worklogDate >= "${startDate}" AND worklogDate <= "${endDate}" AND worklogAuthor = "${accountId}"`;
            console.log('Fetching worklogs with query:', jqlQuery);
            
            const issues = await jiraService.searchJira(jqlQuery, {
                maxResults: 1000,
                fields: ['summary', 'worklog']
            });
            
            let userWorklogs = [];
            
            for (const issue of issues.issues) {
                const worklog = await jiraService.getIssueWorklogs(issue.key);
                const filteredWorklogs = worklog.worklogs.filter(log => {
                    const logDate = new Date(log.started).toISOString().split('T')[0];
                    return logDate >= startDate && 
                           logDate <= endDate && 
                           log.author.accountId === accountId;
                });
                
                filteredWorklogs.forEach(log => {
                    userWorklogs.push({
                        issueKey: issue.key,
                        summary: issue.fields.summary,
                        timeSpent: log.timeSpentSeconds / 3600, // Convert seconds to hours
                        timeSpentSeconds: log.timeSpentSeconds,
                        comment: log.comment,
                        started: log.started
                    });
                });
            }
            
            return userWorklogs;
        } catch (error) {
            console.error('Error fetching user worklogs:', error);
            throw error;
        }
    }
    createUserWorklogEmailContent(worklogs, userId, startDate, endDate) {
        let html = `
            <h1>Worklog Report for ${userId}</h1>
            <h2>Period: ${startDate} to ${endDate}</h2>
            <style>
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
                th { background-color: #f2f2f2; }
                .total-row { font-weight: bold; background-color: #f9f9f9; }
                ul { margin: 0; padding-left: 20px; }
                .low-hours { color: red; }
            </style>
            <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border: 1px solid #ddd;">
                <p><strong>Note:</strong></p>
                <ul>
                    <li>A copy of this worklog report has been shared with your leads. 
                    <li>If there are any missing worklogs, please discuss with your lead and update them accordingly.</li>
                    <li>Please make sure monthly report will include all the missing worklogs for the past week.</li>
                    <li>Please coordinate to generate this report most accurate. Record all your worklogs without fail by the end of each day. Thanks for your contribution.</li>
                </ul>
            </div>
            <br/>
            <table>
                <tr>
                    <th>Worklog Date</th>
                    <th>Issues</th>
                    <th>Total Hours Logged</th>
                </tr>
        `;
        
        // Group worklogs by date
        // In both createUserWorklogEmailContent and createAllUsersWorklogEmailContent methods
        const worklogsByDate = worklogs.reduce((acc, log) => {
            // Convert to IST by adding 5 hours and 30 minutes to UTC
            const date = new Date(log.started);
            const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
            const formattedDate = istDate.toISOString().split('T')[0];
            
            if (!acc[formattedDate]) {
                acc[formattedDate] = {
                    issues: [],
                    totalHours: 0
                };
            }
            acc[formattedDate].issues.push(
                `<a href="https://${process.env.JIRA_HOST}/browse/${log.issueKey}" style="color: #0052cc; text-decoration: none;">${log.issueKey}</a>: ${log.summary} [${(log.timeSpentSeconds / 3600).toFixed(2)}h]`
            );
            acc[formattedDate].totalHours += log.timeSpentSeconds / 3600;
            return acc;
        }, {});

        // Add missing days between start and end date (excluding weekends)
        const start = new Date(startDate);
        const end = new Date(endDate);
        for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            // Skip Saturday (6) and Sunday (0)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const currentDate = d.toISOString().split('T')[0];
                if (!worklogsByDate[currentDate]) {
                    worklogsByDate[currentDate] = {
                        issues: ['Leave / Missing worklog'],
                        totalHours: 0
                    };
                }
            }
        }

        // Sort dates
        const sortedDates = Object.keys(worklogsByDate).sort();
        
        let weeklyTotal = 0;
        
        // Create table rows
        sortedDates.forEach(date => {
            const dayData = worklogsByDate[date];
            weeklyTotal += dayData.totalHours;
            const hoursClass = dayData.totalHours < 8 ? 'class="low-hours"' : '';
            html += `
                <tr>
                    <td>${date}</td>
                    <td><ul>${dayData.issues.map(issue => `<li>${issue}</li>`).join('')}</ul></td>
                    <td  ${hoursClass}>${dayData.totalHours.toFixed(2)}</td>
                </tr>
            `;
        });
        
        // Add weekly total row
        html += `
            <tr class="total-row">
                <td colspan="2"><strong>Total Hours Logged in the Week</strong></td>
                <td><strong>${weeklyTotal.toFixed(2)}</strong></td>
            </tr>
        </table>`;
        
        // After the table, add the note
        html += `
            <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border: 1px solid #ddd;">
                <p><strong>Note:</strong></p>
                <ul>
                    <li>This is a system-generated email. Please do not reply to this email.  If you find any discrepancy in this report, please contact clement@Ltslean.com</li>
                </ul>
            </div>
        `;

        return html;
    }

    async sendUserWorklogEmail(userId, startDate, endDate, worklogs) {
        const htmlContent = this.createUserWorklogEmailContent(worklogs, userId, startDate, endDate);
        
        const emailData = {
            from: {
                name: 'JIRA Worklog Report',
                address: process.env.EMAIL_FROM_ADDRESS
            },
            to: process.env.RECIPIENT_EMAIL,
            subject: `Worklog Report for ${userId} - ${startDate} to ${endDate}`,
            html: htmlContent
        };

        await transporter.sendMail(emailData);
    }
    async getAllUsers() {
        try {
            console.log('Fetching users from JIRA Worklog Reports group...');
            const groupName = "JIRA Worklog Reports";
            const response = await jiraService.getGroupMembers(groupName);

            if (!response || !response.values) {
                throw new Error('Invalid response format from JIRA');
            }

            const activeUsers = [];
            for (const user of response.values) {
                if (user.active) {
                    // Get detailed user info including email
                    activeUsers.push({
                        accountId: user.accountId,
                        displayName: user.displayName,
                        emailAddress:'No email available',
                        active: user.active
                    });
                }
            }

            let finalList = activeUsers.sort((a, b) => a.displayName.localeCompare(b.displayName));
            return finalList;
        } catch (error) {
            console.error('Detailed error in getAllUsers:', error);
            throw new Error(`Failed to fetch users: ${error.message}`);
        }
    }

    async getAllUsersJSON() {
        try {
            console.log('Reading users from local JSON file...');
            const users = userList.map(user => ({
                accountId: user.accountId || 'default',
                displayName: user.displayName,
                emailAddress: user.emailAddress,
                active: true
            }));

            console.log(`Found ${users.length} users from JSON file`);
            return users.sort((a, b) => a.displayName.localeCompare(b.displayName));
        } catch (error) {
            console.error('Error reading users from JSON:', error);
            throw new Error(`Failed to read users: ${error.message}`);
        }
    }

    async fetchAllUsersWorklogs(startDate, endDate) {
        try {
            const users = await this.getAllUsersJSON();
            console.log(`Found ${users.length} users`);
            
            let allWorklogs = {};
            
            for (const user of users) {
                if (user.active) {
                    console.log(`Fetching worklogs for ${user.displayName}`);
                    const userWorklogs = await this.fetchUserWorklogs(startDate, endDate, user.accountId);
                    if (userWorklogs.length > 0) {
                        // Store both displayName and emailAddress
                        allWorklogs[user.displayName] = {
                            worklogs: userWorklogs,
                            email: user.emailAddress
                        };
                    }
                }
            }
            
            return allWorklogs;
        } catch (error) {
            console.error('Error fetching all users worklogs:', error);
            throw error;
        }
    }

    createAllUsersWorklogEmailContent(allWorklogs, startDate, endDate, weekNumber) {
        let html = `
            <h1>All Users Worklog Report - Week ${weekNumber}</h1>
            <h2>Period: ${startDate} to ${endDate}</h2>
            <style>
                table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
                th { background-color: #f2f2f2; }
                .total-row { font-weight: bold; background-color: #f9f9f9; }
                .user-section { margin-bottom: 30px; }
                ul { margin: 0; padding-left: 20px; }
                .low-hours { color: red; }
            </style>
        `;
        // Add summary note
        // In createAllUsersWorklogEmailContent method
        html += `
        <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border: 1px solid #ddd;">
            <p><strong>Summary Note:</strong></p>
            <ul>
                <li>A copy of their individual worklog report has been sent to each user's email address. 
                <li>For users with hours marked in red (less than 8 hours per day) or weekly total hours less than 40, please schedule a discussion to understand any challenges and provide necessary support.</li> <li>Please make sure monthly report will include all the missing worklogs for the past week.</li>
                <li>Please coordinate to generate this report most accurate. Record all your worklogs without fail by the end of each day. Thanks for your contribution.</li>
            </ul>
        </div>
        `;
        Object.entries(allWorklogs).forEach(([userName, userData]) => {
            // First, create the worklogsByDate object as before
            const worklogsByDate = userData.worklogs.reduce((acc, log) => {
                const date = new Date(log.started);
                const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
                const formattedDate = istDate.toISOString().split('T')[0];
                
                if (!acc[formattedDate]) {
                    acc[formattedDate] = { issues: [], totalHours: 0 };
                }
                acc[formattedDate].issues.push(
                    `<a href="https://${process.env.JIRA_HOST}/browse/${log.issueKey}" style="color: #0052cc; text-decoration: none;">${log.issueKey}</a>: ${log.summary} [${log.timeSpent.toFixed(2)}h]`
                );
                acc[formattedDate].totalHours += log.timeSpent;
                return acc;
            }, {});
    
            // Add missing days between start and end date
            const start = new Date(startDate);
            const end = new Date(endDate);
            for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                // Skip Saturday (6) and Sunday (0)
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const currentDate = d.toISOString().split('T')[0];
                    if (!worklogsByDate[currentDate]) {
                        worklogsByDate[currentDate] = {
                            issues: ['Leave / Missing worklog'],
                            totalHours: 0
                        };
                    }
                }
            }
    
            // Rest of the code remains the same
            html += `
            <div class="user-section">
                <h3>${userName} (${userData.email})</h3>
                <table>
                    <tr>
                        <th>Date</th>
                        <th>Issues</th>
                        <th>Hours</th>
                    </tr>
            `;
    
            let userTotal = 0;
            Object.entries(worklogsByDate)
                .sort(([a], [b]) => a.localeCompare(b))
                .forEach(([date, data]) => {
                    userTotal += data.totalHours;
                    const hoursClass = data.totalHours < 8 ? 'class="low-hours"' : '';
                    html += `
                    <tr>
                        <td>${date}</td>
                        <td><ul>${data.issues.map(issue => `<li>${issue}</li>`).join('')}</ul></td>
                        <td ${hoursClass}>${data.totalHours.toFixed(2)}</td>
                    </tr>
                    `;
                });
    
            html += `
                    <tr class="total-row">
                        <td colspan="2">Total Hours</td>
                        <td>${userTotal.toFixed(2)}</td>
                    </tr>
                </table>
            </div>`;
        });

        // Add end note
        html += `
            <div style="margin-top: 30px; padding: 15px; background-color: #f5f5f5; border: 1px solid #ddd;">
                <p><strong>Note:</strong></p>
                <ul>
                    <li>This is a system-generated email. Please do not reply to this email.If you need any improvements in this report, please contact clement@Ltslean.com.</li>
                </ul>
            </div>
        `;

        return html;
    }

    async sendIndividualUserWorklogEmail(userName, userData, startDate, endDate, weekNumber) {
        try {
            const userHtmlContent = this.createUserWorklogEmailContent(
                userData.worklogs,
                userName,
                startDate,
                endDate
            );

            const userEmailData = {
                from: {
                    name: 'JIRA Worklog Report',
                    address: process.env.EMAIL_FROM_ADDRESS
                },
                to: userData.email,
                subject: `Your Worklog Report - Week ${weekNumber} (${startDate} to ${endDate})`,
                html: userHtmlContent
            };

            await transporter.sendMail(userEmailData);
            console.log(`Sent worklog email to ${userName} at ${userData.email}`);
        } catch (error) {
            console.error(`Failed to send email to ${userName}:`, error);
        }
    }

    async sendAllUsersWorklogEmail(startDate, endDate, weekNumber) {
        const allWorklogs = await this.fetchAllUsersWorklogs(startDate, endDate);
        
        // Send consolidated report to admin
        const htmlContent = this.createAllUsersWorklogEmailContent(allWorklogs, startDate, endDate, weekNumber);
        const adminEmailData = {
            from: {
                name: 'JIRA Worklog Report',
                address: process.env.EMAIL_FROM_ADDRESS
            },
            to: process.env.RECIPIENT_EMAIL,
            cc: process.env.CC_EMAIL ? process.env.CC_EMAIL.split(',') : [],
            subject: `All Users Worklog Report - Week ${weekNumber} (${startDate} to ${endDate})`,
            html: htmlContent
        };
        await transporter.sendMail(adminEmailData);

        // Send individual reports to each user
        for (const [userName, userData] of Object.entries(allWorklogs)) {
            if (userData.email && userData.email !== 'No email available') {
                await this.sendIndividualUserWorklogEmail(
                    userName,
                    userData,
                    startDate,
                    endDate,
                    weekNumber
                );
            }
        }
    }
}

module.exports = new WorklogController();