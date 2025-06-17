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
  
  if (month === 3) multiplier = 0.25;      // Q1 - 25% of year
  else if (month === 6) multiplier = 0.5;  // Q2 - 50% of year
  else if (month === 9) multiplier = 0.75; // Q3 - 75% of year
  else if (month === 12) multiplier = 1;   // Q4 - 100% of year
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

async function updateDataFile() {
  try {
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
      const marketingBudget = getAnnualizedMarketingBudget('20241231', quarterlyMarketingBudget);
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
