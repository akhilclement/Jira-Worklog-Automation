const express = require('express');
const router = express.Router();
const worklogController = require('../controllers/worklogController');

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

router.get('/weekly-summary', async (req, res) => {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);
        
        await worklogController.sendWeeklyWorklogEmail(startDate.toISOString().split('T')[0], 
                                                     endDate.toISOString().split('T')[0]);
        res.json({ message: 'Weekly worklog summary sent successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to send weekly worklog summary' });
    }
});

module.exports = router;