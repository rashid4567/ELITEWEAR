const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const PdfPrinter = require("pdfmake");

const generatePDF = async (salesData, res, options = {}) => {
  try {
    const { fromDate, toDate, title = "Sales Report" } = options;

    if (!Array.isArray(salesData)) {
      throw new Error("Sales data must be an array");
    }

    const fonts = {
      Helvetica: {
        normal: "Helvetica",
        bold: "Helvetica-Bold",
        italics: "Helvetica-Oblique",
        bolditalics: "Helvetica-BoldOblique",
      },
    };

    const printer = new PdfPrinter(fonts);

    const formatCurrency = (value) => {
      if (value === undefined || value === null) return "0";

      const numValue = typeof value === "number" ? value : Number(value);

      if (isNaN(numValue)) return "0";

      return numValue.toLocaleString("en-IN", {
        maximumFractionDigits: 0,
        style: "decimal",
      });
    };

    const formatDate = (dateString) => {
      try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        return date.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      } catch (e) {
        return dateString;
      }
    };

    const totalSales = salesData.reduce(
      (sum, item) => sum + (item.total || 0),
      0
    );
    const totalItems = salesData.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueCustomers = new Set(salesData.map((item) => item.buyer)).size;
    const averageOrderValue = totalSales / uniqueCustomers || 0;

    const primaryColor = "#2c3e50";
    const secondaryColor = "#3498db";
    const accentColor = "#e74c3c";
    const lightGray = "#f5f5f5";
    const borderColor = "#cccccc";

    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const formattedTime = currentDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const tableBody = [
      [
        { text: "Buyer", style: "tableHeader", alignment: "left" },
        { text: "Product", style: "tableHeader", alignment: "left" },
        { text: "SKU", style: "tableHeader", alignment: "left" },
        { text: "Qty", style: "tableHeader", alignment: "center" },
        { text: "Price", style: "tableHeader", alignment: "right" },
        { text: "Category", style: "tableHeader", alignment: "left" },
        { text: "Total", style: "tableHeader", alignment: "right" },
      ],
    ];

    salesData.forEach((item, i) => {
      tableBody.push([
        {
          text: (item.buyer || "Unknown").toString().substring(0, 15),
          alignment: "left",
        },
        {
          text: (item.productName || "Unknown").toString().substring(0, 20),
          alignment: "left",
        },
        { text: (item.sku || "").toString(), alignment: "left" },
        { text: (item.quantity || 0).toString(), alignment: "center" },
        { text: `₹${formatCurrency(item.price || 0)}`, alignment: "right" },
        {
          text: (item.category || "Uncategorized").toString().substring(0, 15),
          alignment: "left",
        },
        { text: `₹${formatCurrency(item.total || 0)}`, alignment: "right" },
      ]);
    });

    const docDefinition = {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      info: {
        title: `ELITE WEAR - ${title}`,
        author: "ELITE WEAR Admin",
        subject: "Sales Report",
        keywords: "sales, report, admin, delivered",
      },
      defaultStyle: {
        font: "Helvetica",
      },
      watermark: {
        text: "DELIVERED ORDERS ONLY",
        color: accentColor,
        opacity: 0.08,
        bold: true,
        angle: -45,
      },
      content: [
        {
          stack: [
            { text: "ELITE WEAR", style: "header" },
            { text: title.toUpperCase(), style: "subheader" },
          ],
          style: "headerBox",
        },

        {
          text: `Report Period: ${formatDate(fromDate)} to ${formatDate(
            toDate
          )}`,
          style: "reportPeriod",
          margin: [0, 20, 0, 20],
        },

        {
          columns: [
            {
              stack: [
                { text: "TOTAL SALES", style: "summaryBoxTitle" },
                {
                  text: `₹${formatCurrency(totalSales)}`,
                  style: "summaryBoxValue",
                },
              ],
              style: "summaryBox",
            },
            {
              stack: [
                { text: "ITEMS SOLD", style: "summaryBoxTitle" },
                { text: formatCurrency(totalItems), style: "summaryBoxValue" },
              ],
              style: "summaryBox",
            },
            {
              stack: [
                { text: "UNIQUE CUSTOMERS", style: "summaryBoxTitle" },
                {
                  text: formatCurrency(uniqueCustomers),
                  style: "summaryBoxValue",
                },
              ],
              style: "summaryBox",
            },
            {
              stack: [
                { text: "AVG ORDER VALUE", style: "summaryBoxTitle" },
                {
                  text: `₹${formatCurrency(averageOrderValue)}`,
                  style: "summaryBoxValue",
                },
              ],
              style: "summaryBox",
            },
          ],
          margin: [0, 0, 0, 30],
        },

        {
          text: "Sales Details",
          style: "sectionTitle",
          margin: [0, 0, 0, 10],
        },

        {
          table: {
            headerRows: 1,
            widths: [80, 110, 60, 40, 70, 70, 70],
            body: tableBody,
          },
          layout: {
            fillColor: function (rowIndex) {
              return rowIndex === 0
                ? primaryColor
                : rowIndex % 2 === 0
                ? lightGray
                : null;
            },
            hLineWidth: function (i, node) {
              return i === 0 || i === node.table.body.length ? 1 : 0.5;
            },
            vLineWidth: function (i, node) {
              return 0.5;
            },
            hLineColor: function (i, node) {
              return borderColor;
            },
            vLineColor: function (i, node) {
              return borderColor;
            },
          },
        },
      ],
      footer: function (currentPage, pageCount) {
        return [
          {
            stack: [
              {
                text: `Report generated on ${formattedDate} at ${formattedTime}`,
                alignment: "center",
                color: "white",
                fontSize: 10,
              },
            ],
            margin: [40, 0, 40, 0],
            background: primaryColor,
            padding: 10,
          },
          {
            text: `Page ${currentPage} of ${pageCount}`,
            alignment: "right",
            margin: [0, 10, 40, 0],
            fontSize: 8,
            color: "#7f8c8d",
          },
        ];
      },
      styles: {
        headerBox: {
          background: primaryColor,
          padding: 20,
          alignment: "center",
        },
        header: {
          fontSize: 28,
          bold: true,
          color: "white",
        },
        subheader: {
          fontSize: 16,
          color: "white",
          margin: [0, 10, 0, 0],
        },
        reportPeriod: {
          fontSize: 14,
          bold: true,
          alignment: "center",
          color: "#000000",
        },
        summaryBox: {
          background: secondaryColor,
          padding: [5, 10, 5, 10],
          margin: [5, 0, 5, 0],
          alignment: "center",
        },
        summaryBoxTitle: {
          fontSize: 12,
          color: "white",
          bold: true,
          alignment: "center",
        },
        summaryBoxValue: {
          fontSize: 18,
          color: "white",
          bold: true,
          margin: [0, 5, 0, 0],
          alignment: "center",
        },
        sectionTitle: {
          fontSize: 18,
          bold: true,
          color: primaryColor,
        },
        tableHeader: {
          fontSize: 11,
          bold: true,
          color: "white",
          margin: [0, 5, 0, 5],
        },
      },
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=elite-wear-sales-report-${
        new Date().toISOString().split("T")[0]
      }.pdf`
    );

    pdfDoc.pipe(res);
    pdfDoc.end();

    return true;
  } catch (error) {
    console.error("Error generating PDF:", error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to generate PDF report",
        error: error.message,
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
  generatePDF,
  generateExcel,
};
