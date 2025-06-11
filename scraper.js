const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// Helper function to get the most recent quarter end date
function getMostRecentQuarterEnd() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Determine the most recent quarter end
  let quarterEndMonth;
  if (currentMonth <= 3) quarterEndMonth = 12;
  else if (currentMonth <= 6) quarterEndMonth = 3;
  else if (currentMonth <= 9) quarterEndMonth = 6;
  else quarterEndMonth = 9;
  
  let year = currentYear;
  if (quarterEndMonth === 12) year--;
  
  // Format as YYYYMMDD
  return `${year}${String(quarterEndMonth).padStart(2, '0')}31`;
}

// Helper function to get the year-ago date for the given date
function getYearAgoDate(dateStr) {
  const year = parseInt(dateStr.substring(0, 4)) - 1;
  const rest = dateStr.substring(4);
  return `${year}${rest}`;
}

// Helper function to calculate the annualization multiplier based on quarter
function getAnnualizationMultiplier(dateStr) {
  const month = parseInt(dateStr.substring(4, 6));
  switch(month) {
    case 3: return 0.25;  // Q1 - 25% of year completed
    case 6: return 0.5;   // Q2 - 50% of year completed
    case 9: return 0.75;  // Q3 - 75% of year completed
    case 12: return 1;    // Q4 - 100% of year completed
    default: return 1;
  }
}

// Helper function to check if a report is available
async function isReportAvailable(id, date, rpt) {
  try {
    const testUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=${date}&rpt=${rpt}&typ=html`;
    const response = await axios.get(testUrl);
    const $ = cheerio.load(response.data);
    // Check if the page has actual data by looking for table rows
    return $('tr').length > 0;
  } catch (err) {
    return false;
  }
}

async function scrapeLinksWithClass() {
  try {
    const url = 'https://www.ibanknet.com/scripts/callreports/fiList.aspx?type=ncua';
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);

    const banks = [];

    $('a.pagebody').each((_, a) => {
      const el = $(a);
      const href = el.attr('href');
      const name = el.text().trim();

      if (href && href.includes('ibnid=')) {
        const idMatch = href.match(/ibnid=([^&]+)/);
        const id = idMatch ? idMatch[1] : null;

        if (id) {
          banks.push({ name, id });
        }
      }
    });

    return banks;
  } catch (err) {
    console.error('Error scraping bank links:', err.message);
    return [];
  }
}

async function fetchReportData(id, per, rpt) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=${per}&rpt=${rpt}&typ=html`;

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    const data = {};
    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const label = $(cells[0]).text().trim();
      const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
      const value = parseInt(rawValue, 10);

      if (!isNaN(value)) {
        data[label] = value;
      }
    });

    // If no data was found, throw an error
    if (Object.keys(data).length === 0) {
      throw new Error('No data found in report');
    }

    return data;
  } catch (err) {
    if (err.message === 'No data found in report') {
      console.log(`No data available in report ${rpt} for ${id}`);
    } else {
      console.log(`Error fetching report ${rpt} for ${id}: ${err.message}`);
    }
    return {};
  }
}

async function updateDataFile() {
  try {
    const banks = await scrapeLinksWithClass();
    if (banks.length === 0) {
      console.log('No banks found to process. Exiting.');
      return;
    }

    // Get the most recent quarter end date
    let currentDate = getMostRecentQuarterEnd();
    let yearAgoDate = getYearAgoDate(currentDate);

    // Check if we need to try the next available quarter
    if (banks[0] && !(await isReportAvailable(banks[0].id, currentDate, 'NC'))) {
      // Try the previous quarter
      const prevQuarter = {
        '0331': '1231',
        '0630': '0331',
        '0930': '0630',
        '1231': '0930'
      };
      const year = currentDate.substring(0, 4);
      const quarter = currentDate.substring(4);
      currentDate = `${year}${prevQuarter[quarter]}`;
      yearAgoDate = getYearAgoDate(currentDate);
    }

    const annualizationMultiplier = getAnnualizationMultiplier(currentDate);

    for (const bank of banks) {
      const id = bank.id;

      const [
        dataNC_Q,
        dataNC_Y,
        dataNI_Q,
        dataD_Q,
        dataD_Y
      ] = await Promise.all([
        fetchReportData(id, currentDate, 'NC'),
        fetchReportData(id, yearAgoDate, 'NC'),
        fetchReportData(id, currentDate, 'NI'),
        fetchReportData(id, currentDate, 'D'),
        fetchReportData(id, yearAgoDate, 'D')
      ]);

      const memberCount = dataD_Q['Number of current members (not number of accounts)'];
      const memberCountYTD = dataD_Y['Number of current members (not number of accounts)'];
      const totalAssets = dataNC_Q['TOTAL ASSETS'];
      const totalAssetsYTD = dataNC_Y['TOTAL ASSETS'];
      let marketingBudget = dataNI_Q['Educational and Promotional Expenses'];
      
      // Annualize marketing budget
      if (marketingBudget !== undefined) {
        marketingBudget = Math.round(marketingBudget * annualizationMultiplier);
      }
      
      const potentialMembers = dataD_Q['Number of potential members'];
      const depositYTD = dataD_Y['TOTAL SHARES and DEPOSITS (Sum of items 7 and 8) (Total Amount)'];

      bank.totalAssets = totalAssets || null;
      bank.marketingBudget = marketingBudget || null;
      bank.potentialMemberCount = potentialMembers || null;
      bank.reportDate = currentDate;

      if (memberCount !== undefined && memberCountYTD !== undefined) {
        const memberChange = memberCountYTD - memberCount;
        bank.memberChange = memberChange >= 0 ? `+${memberChange}` : `${memberChange}`;

        bank.mac = (memberChange > 0 && marketingBudget !== undefined)
          ? `$${(marketingBudget / memberChange).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
          : "Losing members";

        bank.assetsPerMemberStart = (totalAssets !== undefined && memberCount > 0)
          ? `$${(totalAssets / memberCount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
          : null;

        bank.assetsPerMemberEnd = (totalAssetsYTD !== undefined && memberCountYTD > 0)
          ? `$${(totalAssetsYTD / memberCountYTD).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
          : null;

        bank.depositPerMember = (depositYTD !== undefined && memberCountYTD > 0)
          ? `$${(depositYTD / memberCountYTD).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
          : null;

        if (totalAssets !== undefined && totalAssetsYTD !== undefined && marketingBudget !== undefined) {
          const assetDelta = totalAssetsYTD - totalAssets;
          bank.costPerDollarOfAssets = assetDelta === 0
            ? "Undefined"
            : assetDelta < 0
              ? "Negative ROI"
              : `$${(marketingBudget / assetDelta).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
        } else {
          bank.costPerDollarOfAssets = null;
        }

        bank.percentPenetration = (potentialMembers && potentialMembers !== 0 && memberCountYTD !== undefined)
          ? `${Math.round((1 - (potentialMembers - memberCountYTD) / potentialMembers) * 100)}%`
          : "Undefined";
      } else {
        bank.memberChange = null;
        bank.mac = null;
        bank.assetsPerMemberStart = null;
        bank.assetsPerMemberEnd = null;
        bank.depositPerMember = null;
        bank.costPerDollarOfAssets = null;
        bank.percentPenetration = null;
      }
    }

    // Only write to file if we have data to write
    if (banks.length > 0) {
      fs.writeFileSync('data.json', JSON.stringify(banks, null, 2));
      console.log(`Data saved to data.json! Using report date: ${currentDate}`);
    } else {
      console.log('No data to save.');
    }
  } catch (err) {
    console.error('Error during scraping:', err.message);
  }
}

updateDataFile();
