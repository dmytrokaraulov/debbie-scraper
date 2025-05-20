const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function scrapeTableData() {
  const url = 'https://www.ibanknet.com/scripts/callreports/fiList.aspx?type=ncua';
  const res = await axios.get(url);

  console.log(res.data.slice(0, 1000)); // Logs first 1000 chars of HTML

  const $ = cheerio.load(res.data);
  const rows = [];

  $('table tr').each((_, tr) => {
    const cols = [];
    $(tr).find('td').each((_, td) => {
      cols.push($(td).text().trim());
    });
    if (cols.length) rows.push(cols);
  });

  // Collect all hrefs inside table rows
  const links = [];
  $('table tr a').each((_, a) => {
    let link = $(a).attr('href');
    if (link) {
      // Make relative path if needed
      if (!link.startsWith('http')) {
        link = link.replace(/^\/+/, ''); // remove leading slash
        link = 'https://www.ibanknet.com/scripts/callreports/' + link;
      }
      links.push(link);
    }
  });

  const additionalData = await scrapeAdditionalPages(links);
  return { updated: new Date().toISOString(), tableData: rows, additionalData };
}

async function scrapeAdditionalPages(links) {
  const additionalData = [];

  // Scrape linked pages concurrently with error handling
  await Promise.all(links.map(async (link) => {
    try {
      const res = await axios.get(link);
      const $ = cheerio.load(res.data);
      const pageTitle = $('title').text();

      // You can extract more data here, e.g. specific table or div
      additionalData.push({ url: link, pageTitle });
    } catch (err) {
      console.error(`Error fetching linked page ${link}:`, err.message);
    }
  }));

  return additionalData;
}

async function updateDataFile() {
  try {
    const data = await scrapeTableData();
    fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
    console.log('Data updated and saved to data.json!');
  } catch (err) {
    console.error('Error during scraping:', err);
  }
}

updateDataFile();
