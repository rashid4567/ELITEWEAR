const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const PdfPrinter = require("pdfmake");

const generateSalesReport = async (salesData, res, options = {}) => {
  try {
    const { fromDate, toDate, title = "Sales Report" } = options;

    if (!Array.isArray(salesData)) {
      throw new Error("Sales data must be an array");
    }


    const totalSales = salesData.reduce((sum, item) => sum + (item.total || 0), 0);
    const totalItems = salesData.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueCustomers = new Set(salesData.map(item => item.buyer)).size;
    const averageOrderValue = totalSales / uniqueCustomers || 0;


    const formatCurrency = (value) => {
      if (value === undefined || value === null) return "0";
      const numValue = typeof value === "number" ? value : Number(value);
      if (isNaN(numValue)) return "0";
      return numValue.toLocaleString("en-IN", {
        maximumFractionDigits: 0,
        style: "decimal"
      });
    };

    const formatDate = (dateString) => {
      try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        });
      } catch (e) {
        return dateString;
      }
    };


    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    const formattedTime = currentDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    // Generate HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ELITE WEAR - ${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
          
          :root {
            --primary-color: #2c3e50;
            --secondary-color: #3498db;
            --accent-color: #e74c3c;
            --light-gray: #f5f5f5;
            --medium-gray: #e0e0e0;
            --dark-gray: #7f8c8d;
            --border-color: #cccccc;
            --text-color: #333333;
            --white: #ffffff;
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', sans-serif;
            color: var(--text-color);
            background-color: var(--white);
            line-height: 1.6;
            padding: 0;
            margin: 0;
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0;
            background-color: var(--white);
            position: relative;
          }
          
          .watermark {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            pointer-events: none;
            z-index: 0;
            opacity: 0.08;
            transform: rotate(-45deg);
          }
          
          .watermark span {
            font-size: 8vw;
            font-weight: bold;
            color: var(--accent-color);
            white-space: nowrap;
          }
          
          .header {
            background-color: var(--primary-color);
            color: var(--white);
            padding: 2rem;
            text-align: center;
            position: relative;
            z-index: 1;
          }
          
          .header h1 {
            font-family: 'Playfair Display', serif;
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            letter-spacing: 1px;
          }
          
          .header h2 {
            font-size: 1.5rem;
            font-weight: 500;
            text-transform: uppercase;
          }
          
          .report-period {
            text-align: center;
            padding: 1.5rem 0;
            font-size: 1.2rem;
            font-weight: 600;
            border-bottom: 1px solid var(--medium-gray);
            margin-bottom: 2rem;
          }
          
          .summary-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2rem;
            flex-wrap: wrap;
          }
          
          .summary-box {
            background-color: var(--secondary-color);
            color: var(--white);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
            flex: 1;
            margin: 0 0.5rem;
            min-width: 200px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          
          .summary-box h3 {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
          }
          
          .summary-box p {
            font-size: 1.8rem;
            font-weight: 700;
          }
          
          .section-title {
            font-size: 1.5rem;
            color: var(--primary-color);
            margin: 2rem 0 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--primary-color);
          }
          
          .sales-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2rem;
          }
          
          .sales-table th {
            background-color: var(--primary-color);
            color: var(--white);
            padding: 1rem;
            text-align: left;
            font-weight: 600;
          }
          
          .sales-table tr:nth-child(even) {
            background-color: var(--light-gray);
          }
          
          .sales-table td {
            padding: 0.8rem 1rem;
            border-bottom: 1px solid var(--border-color);
          }
          
          .sales-table td.right {
            text-align: right;
          }
          
          .sales-table td.center {
            text-align: center;
          }
          
          .footer {
            margin-top: 2rem;
            padding: 1.5rem;
            background-color: var(--primary-color);
            color: var(--white);
            text-align: center;
            font-size: 0.9rem;
          }
          
          .page-number {
            text-align: right;
            color: var(--dark-gray);
            font-size: 0.8rem;
            margin: 1rem 0;
            padding-right: 1rem;
          }
          
          .print-button {
            display: block;
            margin: 2rem auto;
            padding: 0.8rem 2rem;
            background-color: var(--primary-color);
            color: var(--white);
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s;
          }
          
          .print-button:hover {
            background-color: #1a2530;
          }
          
          @media print {
            .print-button {
              display: none;
            }
            
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            
            .container {
              width: 100%;
              max-width: none;
              margin: 0;
              padding: 0;
            }
            
            .summary-row {
              page-break-inside: avoid;
            }
            
            .sales-table {
              page-break-inside: auto;
            }
            
            .sales-table tr {
              page-break-inside: avoid;
              page-break-after: auto;
            }
            
            .sales-table thead {
              display: table-header-group;
            }
            
            @page {
              margin: 0.5cm;
            }
          }
          
          @media (max-width: 768px) {
            .summary-row {
              flex-direction: column;
            }
            
            .summary-box {
              margin: 0.5rem 0;
            }
            
            .sales-table {
              font-size: 0.9rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="watermark">
            <span>DELIVERED ORDERS ONLY</span>
          </div>
          
          <div class="header">
            <h1>ELITE WEAR</h1>
            <h2>${title.toUpperCase()}</h2>
          </div>
          
          <div class="report-period">
            Report Period: ${formatDate(fromDate)} to ${formatDate(toDate)}
          </div>
          
          <div class="summary-row">
            <div class="summary-box">
              <h3>TOTAL SALES</h3>
              <p>₹${formatCurrency(totalSales)}</p>
            </div>
            <div class="summary-box">
              <h3>ITEMS SOLD</h3>
              <p>${formatCurrency(totalItems)}</p>
            </div>
            <div class="summary-box">
              <h3>UNIQUE CUSTOMERS</h3>
              <p>${formatCurrency(uniqueCustomers)}</p>
            </div>
            <div class="summary-box">
              <h3>AVG ORDER VALUE</h3>
              <p>₹${formatCurrency(averageOrderValue)}</p>
            </div>
          </div>
          
          <h2 class="section-title">Sales Details</h2>
          
          <table class="sales-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Product</th>
                <th>SKU</th>
                <th class="center">Qty</th>
                <th class="right">Price</th>
                <th>Category</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${salesData.map((item, i) => `
                <tr>
                  <td>${(item.buyer || "Unknown").toString().substring(0, 15)}</td>
                  <td>${(item.productName || "Unknown").toString().substring(0, 20)}</td>
                  <td>${(item.sku || "").toString()}</td>
                  <td class="center">${(item.quantity || 0).toString()}</td>
                  <td class="right">₹${formatCurrency(item.price || 0)}</td>
                  <td>${(item.category || "Uncategorized").toString().substring(0, 15)}</td>
                  <td class="right">₹${formatCurrency(item.total || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <button class="print-button" onclick="window.print()">Print Report</button>
          
          <div class="footer">
            Report generated on ${formattedDate} at ${formattedTime}
          </div>
          
          <div class="page-number">
            Page 1
          </div>
        </div>
        
        <script>
          // Add page numbers for printing
          window.onbeforeprint = function() {
            const pageNumbers = document.querySelectorAll('.page-number');
            pageNumbers.forEach((el, i) => {
              el.textContent = 'Page ' + (i + 1);
            });
          };
        </script>
      </body>
      </html>
    `;


    const filename = `elite-wear-sales-report-${new Date().toISOString().split('T')[0]}.html`;
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
  
    res.send(htmlContent);
    return true;
    
  } catch (error) {
    console.error("Error generating HTML report:", error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to generate HTML report",
        error: error.message
      });
    }
    
    return false;
  }
};

const generateExcel = async (salesData, res, options = {}) => {
  const { fromDate, toDate } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Elite Wear";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Sales Report");

  worksheet.columns = [
    { header: "Buyer", key: "buyer", width: 20 },
    { header: "Product Name", key: "productName", width: 30 },
    { header: "Product ID", key: "sku", width: 15 },
    { header: "Quantity", key: "quantity", width: 10 },
    { header: "Price", key: "price", width: 15 },
    { header: "Category", key: "category", width: 15 },
    { header: "Total", key: "total", width: 15 },
    { header: "Date", key: "orderDate", width: 20 },
    { header: "Status", key: "status", width: 15 },
    { header: "Payment Method", key: "paymentMethod", width: 15 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "4167B8" },
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFF" } };

  salesData.forEach((item) => {
    worksheet.addRow({
      buyer: item.buyer,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      price: item.price,
      category: item.category,
      total: item.total,
      orderDate: new Date(item.orderDate).toLocaleDateString(),
      status: item.status,
      paymentMethod: item.paymentMethod,
    });
  });

  const totalSales = salesData.reduce((sum, item) => sum + item.total, 0);
  const totalItems = salesData.reduce((sum, item) => sum + item.quantity, 0);

  worksheet.addRow([]);
  worksheet.addRow(["Report Period:", `${fromDate} to ${toDate}`]);
  worksheet.addRow(["Total Sales:", `₹${totalSales.toLocaleString()}`]);
  worksheet.addRow(["Items Sold:", totalItems]);
  worksheet.addRow(["Generated On:", new Date().toLocaleString()]);

  worksheet.getColumn("price").numFmt = "₹#,##0.00";
  worksheet.getColumn("total").numFmt = "₹#,##0.00";

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=sales-report-${
      new Date().toISOString().split("T")[0]
    }.xlsx`
  );

  await workbook.xlsx.write(res);
};

module.exports = {
  generateSalesReport,
  generateExcel,
};
