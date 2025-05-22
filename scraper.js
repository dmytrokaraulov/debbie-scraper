const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

function parseDollarValue(text) {
  return parseInt(text.trim().replace(/,/g, ''), 10);
}

async function fetchTableData(url, label) {
  try {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    let value = null;

    $('tr').each((_, row) => {
      const cells = $(row).find('td');
      const cellLabel = $(cells[0]).text().trim();
      if (cellLabel === label) {
        value = parseDollarValue($(cells[1]).text());
      }
    });

    return value;
  } catch (err) {
    console.error(`Error fetching data for ${url}: ${err.message}`);
    return null;
  }
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
      if (id) banks.push({ name, id });
    }
  });

  return banks;
}

async function updateDataFile() {
  try {
    const banks = await scrapeLinksWithClass();

    for (const [index, bank] of banks.entries()) {
      console.log(`Processing ${bank.name} (${index + 1}/${banks.length})`);

      const id = bank.id;
      const urls = {
        assetsCurrent: `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=NC&typ=html`,
        assetsYTD: `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20231231&rpt=NC&typ=html`,
        marketing: `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=NI&typ=html`,
        membersCurrent: `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20240930&rpt=D&typ=html`,
        membersYTD: `https://www.ibanknet.com/scripts/callreports/viewreport.aspx?ibnid=${id}&per=20231231&rpt=D&typ=html`,
      };

      bank.totalAssets = await fetchTableData(urls.assetsCurrent, 'TOTAL ASSETS');
      const totalAssetsYDT = await fetchTableData(urls.assetsYTD, 'TOTAL ASSETS');
      bank.marketingBudget = await fetchTableData(urls.marketing, 'Educational and Promotional Expenses');
      const memberCount = await fetchTableData(urls.membersCurrent, 'Number of current members (not number of accounts)');
      const memberCountYTD = await fetchTableData(urls.membersYTD, 'Number of current members (not number of accounts)');

      bank.memberChange = (memberCountYTD !== null && memberCount !== null) ? memberCountYTD - memberCount : null;

      if (bank.memberChange > 0 && bank.marketingBudget !== null) {
        const mac = bank.marketingBudget / bank.memberChange;
        bank.mac = `$${mac.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
      } else {
        bank.mac = "Losing members";
      }

      if (bank.totalAssets !== null && memberCount > 0) {
        const assetsPerMemberStart = bank.totalAssets / memberCount;
        bank.assetsPerMemberStart = `$${assetsPerMemberStart.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
      }

      if (totalAssetsYDT !== null && memberCountYTD > 0) {
        const assetsPerMemberEnd = totalAssetsYDT / memberCountYTD;
        bank.assetsPerMemberEnd = `$${assetsPerMemberEnd.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
      }

      if (bank.totalAssets !== null && totalAssetsYDT !== null && bank.marketingBudget !== null) {
        const assetDelta = totalAssetsYDT - bank.totalAssets;
        if (assetDelta === 0) {
          bank.costPerDollarOfAssets = "Undefined";
        } else {
          const cost = bank.marketingBudget / assetDelta;
          bank.costPerDollarOfAssets = cost < 0 ? "Negative ROA" : `$${cost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
        }
      }
    }

    fs.writeFileSync('data.json', JSON.stringify(banks, null, 2));
    console.log('Data saved to data.json!');
  } catch (err) {
    console.error('Error during scraping:', err);
  }
}

updateDataFile();
