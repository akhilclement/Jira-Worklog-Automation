const express = require('express');
const router = express.Router();
const worklogController = require('../controllers/worklogController');
const { getWeekDates } = require('../utils/dateUtils');

router.get('/send-worklog-email/', async (req, res) => {
    try {
        // const { userId } = req.params;
        const today = new Date().toISOString().split('T')[0];
        await worklogController.sendWorklogEmail(today);
        res.json({ message: 'Worklog emails sent successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to send worklog emails' });
    }
});

router.get('/all-user-list', async (req, res) => {
    try {
        await worklogController.getAllUsers()
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to all user list' });
    }
});
router.get('/user-worklogs', async (req, res) => {
    try {
        const { userId, startDate, endDate } = req.query;
        
        if (!userId || !startDate || !endDate) {
            return res.status(400).json({ 
                error: 'Missing required parameters. Please provide userId, startDate, and endDate' 
            });
        }

        const worklogs = await worklogController.fetchUserWorklogs(startDate, endDate, userId);
        await worklogController.sendUserWorklogEmail(userId, startDate, endDate, worklogs);

        res.json({
            message: 'Worklog email sent successfully',
            user: userId,
            period: { startDate, endDate }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch and send user worklogs',
            details: error.message
        });
    }
});

router.get('/all-users-worklogs', async (req, res) => {
    try {
        const { weekNumber } = req.query;
        
        if (!weekNumber) {
            return res.status(400).json({ 
                error: 'Missing required parameter. Please provide weekNumber' 
            });
        }

        const { startDate, endDate } = getWeekDates(parseInt(weekNumber));

        await worklogController.sendAllUsersWorklogEmail(startDate, endDate, weekNumber);
        res.json({
            message: 'All users worklog email sent successfully',
            period: { 
                weekNumber,
                startDate, 
                endDate 
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Failed to send all users worklog email',
            details: error.message
        });
    }
});

module.exports = router;