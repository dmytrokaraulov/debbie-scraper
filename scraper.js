const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// Scraping function
async function scrapeTableData() {
  const url = 'https://www.ibanknet.com/scripts/callreports/fiList.aspx?type=ncua';
  const res = await axios.get(url);

  console.log(res.data.slice(0, 1000)); // ✅ This is now inside an async function

  const $ = cheerio.load(res.data);
  const rows = [];

  $('table tr').each((_, tr) => {
    const cols = [];
    $(tr).find('td').each((_, td) => {
      cols.push($(td).text().trim());
    });
    if (cols.length) rows.push(cols);
  });

  const links = [];
  $('table tr a').each((_, a) => {
    const link = $(a).attr('href');
    if (link) links.push(link);
  });

  const additionalData = await scrapeAdditionalPages(links);
  return { updated: new Date().toISOString(), tableData: rows, additionalData };
}

// Function to scrape linked pages
async function scrapeAdditionalPages(links) {
  const additionalData = [];

  for (const link of links) {
    const res = await axios.get(`https://www.ibanknet.com/scripts/callreports/${link}`);
    const $ = cheerio.load(res.data);
    
    // Example of extracting data from a linked page (adjust based on actual page content)
    const pageData = { pageTitle: $('title').text() }; // Just an example, modify as needed
    additionalData.push(pageData);
  }

  return additionalData;
}

// Main function to update the JSON file
async function updateDataFile() {
  const data = await scrapeTableData();
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
  console.log('Data updated!');
}

updateDataFile().catch((err) => {
  console.error('Error during scraping:', err);
});

