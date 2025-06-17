const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// Date variables for report periods
const startDate = '20240331';  // Q1 2024
const endDate = '20250331';    // Q4 2024

function getAnnualizedMarketingBudget(date, quarterlyBudget) {
  if (!quarterlyBudget) return null;
  
  const month = parseInt(date.substring(4, 6), 10);
  let multiplier;
  
  if (month === 3) multiplier = 0.25;      
  else if (month === 6) multiplier = 0.5; 
  else if (month === 9) multiplier = 0.75; 
  else if (month === 12) multiplier = 1;   
  else return null;
  
  return Math.round(quarterlyBudget / multiplier);
}

async function scrapeLinksWithClass() {
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

    return data;
  } catch (err) {
    console.error(`Error fetching report ${rpt} for ${id}: ${err.message}`);
    return {};
  }
}

async function checkReportAvailability(id, date, reportType) {
  try {
    const data = await fetchReportData(id, date, reportType);
    // Check if we got any meaningful data back
    return Object.keys(data).length > 0;
  } catch (err) {
    return false;
  }
}

async function getLatestAvailableDates() {
  // Get current date
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JavaScript months are 0-based
  
  // Determine current quarter
  let currentQuarter = Math.ceil(currentMonth / 3);
  let currentYearStr = currentYear.toString();
  
  // Quarter end dates
  const quarterEndDates = {
    1: '0331', // Q1
    2: '0630', // Q2
    3: '0930', // Q3
    4: '1231'  // Q4
  };

  // Start with a test ID (we'll use the first bank we find)
  const testBanks = await scrapeLinksWithClass();
  if (testBanks.length === 0) {
    throw new Error('No banks found to test report availability');
  }
  const testId = testBanks[0].id;

  // Try to find the most recent available report
  let endDate = null;
  let startDate = null;
  
  // Try up to 4 quarters back
  for (let i = 0; i < 4; i++) {
    const quarter = currentQuarter - i;
    const year = currentYear - Math.floor((currentQuarter - i - 1) / 4);
    const dateStr = `${year}${quarterEndDates[((quarter - 1) % 4) + 1]}`;
    
    // Check if report is available
    const isAvailable = await checkReportAvailability(testId, dateStr, 'NC');
    
    if (isAvailable) {
      endDate = dateStr;
      // Calculate start date (same quarter, previous year)
      const startYear = year - 1;
      startDate = `${startYear}${quarterEndDates[((quarter - 1) % 4) + 1]}`;
      
      // Verify start date is also available
      const startDateAvailable = await checkReportAvailability(testId, startDate, 'NC');
      if (startDateAvailable) {
        break;
      }
    }
  }

  if (!endDate || !startDate) {
    throw new Error('Could not find available report dates');
  }

  return { startDate, endDate };
}

async function updateDataFile() {
  try {
    // Get the latest available dates
    const { startDate, endDate } = await getLatestAvailableDates();
    console.log(`Using report period: ${startDate} to ${endDate}`);

    const banks = await scrapeLinksWithClass();

    for (const bank of banks) {
      const id = bank.id;

      const [
        dataNC_Q,
        dataNC_Y,
        dataNI_Q,
        dataD_Q,
        dataD_Y
      ] = await Promise.all([
        fetchReportData(id, startDate, 'NC'),
        fetchReportData(id, endDate, 'NC'),
        fetchReportData(id, endDate, 'NI'),
        fetchReportData(id, startDate, 'D'),
        fetchReportData(id, endDate, 'D')
      ]);

      const memberCount = dataD_Q['Number of current members (not number of accounts)'];
      const memberCountYTD = dataD_Y['Number of current members (not number of accounts)'];
      const totalAssets = dataNC_Q['TOTAL ASSETS'];
      const totalAssetsYTD = dataNC_Y['TOTAL ASSETS'];
      const quarterlyMarketingBudget = dataNI_Q['Educational and Promotional Expenses'];
      const marketingBudget = getAnnualizedMarketingBudget(endDate, quarterlyMarketingBudget);
      const potentialMembers = dataD_Q['Number of potential members'];
      const depositYTD = dataD_Y['TOTAL SHARES and DEPOSITS (Sum of items 7 and 8) (Total Amount)'];

      bank.totalAssets = totalAssets || null;
      bank.marketingBudget = marketingBudget || null;
      bank.potentialMemberCount = potentialMembers || null;

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

    fs.writeFileSync('data.json', JSON.stringify(banks, null, 2));
    console.log('Data saved to data.json!');
  } catch (err) {
    console.error('Error during scraping:', err);
  }
}

updateDataFile();
