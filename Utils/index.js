const moment = require('moment');

exports.combineAndSortByCreatedAt = (array1, array2) => {
    const combinedArray = [...array1, ...array2];

    combinedArray.sort((a, b) => {
        const dateA = moment(a.createdAt);
        const dateB = moment(b.createdAt);

        return dateB.diff(dateA);
    });

    return combinedArray;
};