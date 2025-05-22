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

async function fetchTotalAssetsYTD(id) {
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=NC&typ=html`;

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
  const reportUrl = `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=D&typ=html`;

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

async function updateDataFile() {
  try {
    const banks = await scrapeLinksWithClass();

for (const bank of banks) {
  bank.totalAssets = await fetchTotalAssets(bank.id);
  bank.marketingBudget = await fetchMarketingBudget(bank.id);

  const memberCount = await fetchMemberCount(bank.id);
  const memberCountYTD = await fetchMemberCountYTD(bank.id);
  const totalAssetsYDT = await fetchTotalAssetsYTD(bank.id);

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

    // Assets per Member
    if (bank.totalAssets !== null && memberCount > 0) {
      const assetsPerMember = bank.totalAssets / memberCount;
      bank.assetsPerMember = `$${assetsPerMember.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    } else {
      bank.assetsPerMember = null;
    }

  } else {
    bank.memberChange = null;
    bank.mac = null;
    bank.assetsPerMember = null;
  }

  bank.potentialMemberCount = await fetchPotentialMemberCount(bank.id);
}


    fs.writeFileSync('data.json', JSON.stringify(banks, null, 2));
    console.log('Data with total assets and member change saved to data.json!');
  } catch (err) {
    console.error('Error during scraping:', err);
  }
}

updateDataFile();
