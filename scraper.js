const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

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

async function fetchTotalAssets(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=NC&typ=html`;20231231

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const label = $(cells[0]).text().trim();
      if (label === 'TOTAL ASSETS') {
        const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
        value = parseInt(rawValue, 10);
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching total assets for ${id}: ${err.message}`);
    return null;
  }
}

async function fetchTotalAssetsYTD(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20231231&rpt=NC&typ=html`;

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const label = $(cells[0]).text().trim();
      if (label === 'TOTAL ASSETS') {
        const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
        value = parseInt(rawValue, 10);
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching total assets for ${id}: ${err.message}`);
    return null;
  }
}

async function fetchMarketingBudget(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=NI&typ=html`;

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const label = $(cells[0]).text().trim();
      if (label === 'Educational and Promotional Expenses') {
        const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
        value = parseInt(rawValue, 10);
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching marketing budget for ${id}: ${err.message}`);
    return null;
  }
}

async function fetchMemberCount(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=D&typ=html`;20231231

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const label = $(cells[0]).text().trim();
      if (label === 'Number of current members (not number of accounts)') {
        const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
        value = parseInt(rawValue, 10);
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching member count for ${id}: ${err.message}`);
    return null;
  }
}

async function fetchPotentialMemberCount(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=D&typ=html`;

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const label = $(cells[0]).text().trim();
      if (label === 'Number of potential members') {
        const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
        value = parseInt(rawValue, 10);
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching potential member count for ${id}: ${err.message}`);
    return null;
  }
}

async function fetchMemberCountYTD(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20231231&rpt=D&typ=html`;

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const label = $(cells[0]).text().trim();
      if (label === 'Number of current members (not number of accounts)') {
        const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
        value = parseInt(rawValue, 10);
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching member count for ${id}: ${err.message}`);
    return null;
  }
}

async function fetchDepositYTD(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20231231&rpt=D&typ=html`;

  try {
    const res = await axios.get(reportUrl);
    const $ = cheerio.load(res.data);

    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const label = $(cells[0]).text().trim();
      if (label === 'TOTAL SHARES and DEPOSITS (Sum of items 7 and 8) (Total Amount)') {
        const rawValue = $(cells[1]).text().trim().replace(/,/g, '');
        value = parseInt(rawValue, 10);
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching deposits ${id}: ${err.message}`);
    return null;
  }
}


async function updateDataFile() {
  try {
    const banks = await scrapeLinksWithClass();

for (const bank of banks) {
  bank.totalAssets = await fetchTotalAssets(bank.id);
  bank.marketingBudget = await fetchMarketingBudget(bank.id);
  bank.potentialMemberCount = await fetchPotentialMemberCount(bank.id);

  const memberCount = await fetchMemberCount(bank.id);
  const memberCountYTD = await fetchMemberCountYTD(bank.id);
  const totalAssetsYDT = await fetchTotalAssetsYTD(bank.id);
  const depositYDT = await fetchDepositYTD(bank.id);


  if (memberCount !== null && memberCountYTD !== null) {
    const memberChange = memberCountYTD - memberCount;
    bank.memberChange = memberChange;

    // MAC
    if (memberChange > 0 && bank.marketingBudget !== null) {
      const mac = bank.marketingBudget / memberChange;
      bank.mac = `$${mac.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    } else {
      bank.mac = "Losing members";
    }

    // Assets per Member Start
    if (bank.totalAssets !== null && memberCount > 0) {
      const assetsPerMemberStart = bank.totalAssets / memberCount;
      bank.assetsPerMemberStart = `$${assetsPerMemberStart.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    } else {
      bank.assetsPerMemberStart = null;
    }

     // Assets per Member End
    if (totalAssetsYDT !== null && memberCountYTD > 0) {
      const assetsPerMemberEnd = totalAssetsYDT / memberCountYTD;
      bank.assetsPerMemberEnd = `$${assetsPerMemberEnd.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    } else {
      bank.assetsPerMemberEnd = null;
    }

     // Deposits
    if (depositYDT !== null && memberCountYTD > 0) {
      const depositPerMember = depositYDT / memberCountYTD;
      bank.depositPerMember = `$${depositPerMember.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    } else {
      bank.depositPerMember = null;
    }

 // Cost per Dollar of Assets
if (
  bank.totalAssets !== null &&
  totalAssetsYDT !== null &&
  bank.marketingBudget !== null
) {
  const assetDelta = totalAssetsYDT - bank.totalAssets;

  if (assetDelta === 0) {
    bank.costPerDollarOfAssets = "Undefined";
  } else {
    const cost = bank.marketingBudget / assetDelta;
    if (cost < 0) {
      bank.costPerDollarOfAssets = "Negative ROA";
    } else {
      bank.costPerDollarOfAssets = `$${cost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    }
  }
} else {
  bank.costPerDollarOfAssets = null;
}


// Percent Penetration (no decimals)
if (
  bank.potentialMemberCount !== null &&
  bank.potentialMemberCount !== 0 &&
  memberCountYTD !== null
) {
  const penetration = 1 - ((bank.potentialMemberCount - memberCountYTD) / bank.potentialMemberCount);
  bank.percentPenetration = `${Math.round(penetration * 100)}%`;
} else {
  bank.percentPenetration = "Undefined";
}

    

  } else {
    bank.memberChange = null;
    bank.mac = null;
    bank.assetsPerMemberStart = null;
    bank.assetsPerMemberEnd = null;
    bank.depositPerMember = null;
    bank.costPerDollarOfAssets = null;
  }


}


    fs.writeFileSync('data.json', JSON.stringify(banks, null, 2));
    console.log('Data with total assets and member change saved to data.json!');
  } catch (err) {
    console.error('Error during scraping:', err);
  }
}

updateDataFile();
