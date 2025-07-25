const xlsx = require('node-xlsx');
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');
const { getAll, updateAll } = require('../repos/interest-repo');

const getExcel = (xlsPath) => {
    return xlsx.parse(xlsPath);
}

const sheets = {
    interests: 0
}

const columns = {
    date: 0,
    interest: 1
}

const amountOfDaysInYear = (year) => {
    const isLeapYear = year % 400 === 0 || (year % 100 !== 0 && year % 4 === 0);
    const daysInYear = isLeapYear ? 366 : 365;

    return daysInYear;
}

const convertToDailyInterest = (value, amountOfDaysBetweenCalcs) => {
    // const dailyInterest = Math.pow((1 + value/100),(1/365.2425));
    const dailyInterest = (value / 100 / amountOfDaysBetweenCalcs);
    // const dailyInterest = 1 + ((value/100)*(1/daysInYear));
    // const dailyInterest = Math.pow((1 + value/100),(1/daysInYear));

    return dailyInterest;
}

const getInterestByDate = (date, amountOfDaysBetweenCalcs, interestType) => {
    let worksheet = interestsExcel[sheets.interests];
    if (interestType === 'legal-interest') {
        worksheet = interestsExcel[sheets.interests];
    } else if (interestType === 'illegal-interest') {
        worksheet = illeagalInterestsExcel[sheets.interests];
    } else if (interestType === 'shekel-interest') {
        worksheet = shekelInterestsExcel[sheets.interests];
    }

    let i = 2;
    while (i <= worksheet.data.length && i + 1 < worksheet.data.length) {
        const rowDate = moment(worksheet.data[i][columns.date], 'DD/MM/YYYY').toDate();
        const nextRowDate = moment(worksheet.data[i + 1][columns.date], 'DD/MM/YYYY').toDate();
        if (rowDate < date) {
            if (i + 1 < worksheet.data.length && nextRowDate > date) {
                break;
            }
            else {
                if (i + 1 < worksheet.data.length && nextRowDate <= date) {
                    i++;
                } else {
                    break;
                }
            }
        } else {
            // notice the date is older than the oldest in the excel
            break;
        }
    }

    const dailyInterest = convertToDailyInterest(worksheet.data[i][columns.interest], amountOfDaysBetweenCalcs);

    return dailyInterest;
}

const getInterestByDateUsingRepo = async (interestsTable, date, amountOfDaysBetweenCalcs, interestType) => {
    const interests = interestsTable;
    let interestsArray = interests.ligelInterests;
    if (interestType === 'legal-interest') {
        interestsArray = interests.ligelInterests;
    } else if (interestType === 'illegal-interest') {
        interestsArray = interests.illigelInterests;
    } else if (interestType === 'shekel-interest') {
        interestsArray = interests.shekelInterests;
    }


    let i = interestsArray.length - 1;
    while (i - 1 >= 0) {
        const rowDate = moment(interestsArray[i].date, 'DD/MM/YYYY').toDate();
        const nextRowDate = moment(interestsArray[i - 1].date, 'DD/MM/YYYY').toDate();
        if (rowDate < date) {
            if (i - 1 < interestsArray.length && nextRowDate > date) {
                break;
            }
            else {
                if (i - 1 < interestsArray.length && nextRowDate <= date) {
                    i--;
                } else {
                    break;
                }
            }
        } else {
            // notice the date is older than the oldest in the excel
            break;
        }
    }

    const dailyInterest = convertToDailyInterest(interestsArray[i].interest, amountOfDaysBetweenCalcs);

    return dailyInterest;
}

const recursiveDailyInterestFromDate = async (endDate, date, interestType) => {
    const interestsTable = await getAll(); // for caching the interests and not read it every time.
    const DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;
    const today = new Date(date);
    let totalRecursiveInterest = 1;
    const yearlySumInterest = [];
    let currentYearInterest = 0;

    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    let amountOfDaysBetweenCalcs = Math.round(Math.abs((nextYear - today) / (DAY_IN_MILISECONDS)));

    while (today < endDate) {
        const daylyInterest = await getInterestByDateUsingRepo(interestsTable,
            today,
            amountOfDaysBetweenCalcs,
            interestType);
        const tommorow = new Date(today);
        tommorow.setDate(tommorow.getDate() + 1);
        // totalRecursiveInterest = daylyInterest * totalRecursiveInterest ;

        if (tommorow >= endDate) {
            currentYearInterest += daylyInterest;
            yearlySumInterest.push(currentYearInterest)
        } else if ((today.getDate() === nextYear.getDate() &&
            today.getMonth() === nextYear.getMonth() &&
            today.getFullYear() === nextYear.getFullYear())) {
            yearlySumInterest.push(currentYearInterest)
            currentYearInterest = 0;
            currentYearInterest += daylyInterest;
            nextYear.setFullYear(nextYear.getFullYear() + 1);
            amountOfDaysBetweenCalcs = Math.round(Math.abs((nextYear - today) / (DAY_IN_MILISECONDS)));
        } else {
            currentYearInterest += daylyInterest;
        }

        today.setDate(today.getDate() + 1);
    }

    totalRecursiveInterest = yearlySumInterest.reduce((totalInterest, yearlySumInterest) => totalInterest * (1 + yearlySumInterest), 1);

    return totalRecursiveInterest;
}

const getInterestsTable = (interestType) => {
    if (interestType === 'legal-interest') {
        worksheet = interestsExcel[sheets.interests];
    } else if (interestType === 'illegal-interest') {
        worksheet = illeagalInterestsExcel[sheets.interests];
    } else if (interestType === 'shekel-interest') {
        worksheet = shekelInterestsExcel[sheets.interests];
    }

    return worksheet;
}

const refreshExcelFiles = async () => {
    try {
        const interests = {
            ligelInterests: [],
            illigelInterests: [],
            shekelInterests: []
        };

        await saveTempXLS('https://ga.mof.gov.il/api/rate/history/12');
        interestsExcel = getExcel("./assets/interest_tmp.xls");

        await saveTempXLS('https://ga.mof.gov.il/api/rate/history/9')
        illeagalInterestsExcel = getExcel("./assets/interest_tmp.xls");

        await saveTempXLS('https://ga.mof.gov.il/api/rate/history/10')
        shekelInterestsExcel = getExcel("./assets/interest_tmp.xls");

        interests.ligelInterests = getInterestsTable('legal-interest').data.slice(2).map(x => ({ date: x[0], interest: x[1] || 1 })).reverse();
        interests.illigelInterests = getInterestsTable('illegal-interest').data.slice(2).map(x => ({ date: x[0], interest: x[1] || 1})).reverse();
        interests.shekelInterests = getInterestsTable('shekel-interest').data.slice(2).map(x => ({ date: x[0], interest: x[1] || 1})).reverse();

        await updateAll(interests)
    } catch (err) {
        console.log("failed to refresh rates")
    }
}

const saveTempXLS = (url) => {
    return axios.request({
        responseType: 'arraybuffer',
        url: url,
        method: 'get',
        headers: {
            'Content-Type': 'blob',
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
        },
    }).then((result) => {
        console.log(`successfully fetched ${url}`);
        const outputFilename = './assets/interest_tmp.xls';
        fs.writeFileSync(outputFilename, result.data);
        console.log(`saved ${outputFilename}`);
        return outputFilename;
    });
}

let interestsExcel = getExcel("./assets/interest.xlsx");
// let interestsExcel = getExcel("C://Users//ofire//Documents//personal projects//Actuar//actuar-services//interest-calculator//assets//interest.xlsx");
let illeagalInterestsExcel = getExcel("./assets/illegal-interest.xlsx");
// let illeagalInterestsExcel = getExcel("C://Users//ofire//Documents//personal projects//Actuar//actuar-services//interest-calculator//assets//illegal-interest.xlsx");
let shekelInterestsExcel = getExcel("./assets/shekel-interest.xlsx");
// let shekelInterestsExcel = getExcel("C://Users//ofire//Documents//personal projects//Actuar//actuar-services//interest-calculator//assets//shekel-interest.xlsx");


module.exports = { recursiveDailyInterestFromDate, refreshExcelFiles }