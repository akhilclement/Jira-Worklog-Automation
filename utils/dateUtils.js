function getWeekDates(weekNumber) {
    const currentYear = new Date().getFullYear();
    const firstDayOfYear = new Date(currentYear, 0, 1);
    
    // Calculate the start date (Monday) of the specified week
    const startDate = new Date(firstDayOfYear);
    startDate.setDate(firstDayOfYear.getDate() + (weekNumber - 1) * 7 - firstDayOfYear.getDay() + 1);
    
    // Calculate the end date (Sunday) of the specified week
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
    };
}

module.exports = {
    getWeekDates
};