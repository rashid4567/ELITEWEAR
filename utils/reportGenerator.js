const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');


const generatePDF = async (salesData, res, options = {}) => {
    const { fromDate, toDate } = options;
    

    const doc = new PDFDocument({ margin: 50 });
    
 
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.pdf`);
    

    doc.pipe(res);
    
  
    doc.fontSize(25).text('ELITE WEAR', { align: 'center' });
    doc.fontSize(18).text('Sales Report', { align: 'center' });
    doc.moveDown();
    

    doc.fontSize(12).text(`Report Period: ${fromDate} to ${toDate}`, { align: 'center' });
    doc.moveDown();
    
    const totalSales = salesData.reduce((sum, item) => sum + item.total, 0);
    const totalItems = salesData.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueCustomers = new Set(salesData.map(item => item.buyer)).size;
    
    doc.fontSize(14).text('Summary', { underline: true });
    doc.fontSize(12).text(`Total Sales: ₹${totalSales.toLocaleString()}`);
    doc.fontSize(12).text(`Items Sold: ${totalItems}`);
    doc.fontSize(12).text(`Unique Customers: ${uniqueCustomers}`);
    doc.moveDown();
    
   
    doc.fontSize(14).text('Sales Details', { underline: true });
    doc.moveDown();
    
  
    const tableTop = doc.y;
    const tableHeaders = ['Buyer', 'Product', 'ID', 'Qty', 'Price', 'Category', 'Total'];
    const tableColumnWidths = [100, 120, 60, 40, 60, 80, 80];
    
    
    let currentX = 50;
    doc.fontSize(10).font('Helvetica-Bold');
    tableHeaders.forEach((header, i) => {
        doc.text(header, currentX, tableTop, { width: tableColumnWidths[i], align: 'left' });
        currentX += tableColumnWidths[i];
    });
    

    doc.font('Helvetica');
    let currentY = tableTop + 20;
    
    salesData.forEach((item, index) => {
 
        if (currentY > 700) {
            doc.addPage();
            currentY = 50;
            
      
            currentX = 50;
            doc.fontSize(10).font('Helvetica-Bold');
            tableHeaders.forEach((header, i) => {
                doc.text(header, currentX, currentY, { width: tableColumnWidths[i], align: 'left' });
                currentX += tableColumnWidths[i];
            });
            doc.font('Helvetica');
            currentY += 20;
        }
        
        currentX = 50;
        doc.fontSize(9);
        doc.text(item.buyer, currentX, currentY, { width: tableColumnWidths[0], align: 'left' });
        currentX += tableColumnWidths[0];
        
        doc.text(item.productName, currentX, currentY, { width: tableColumnWidths[1], align: 'left' });
        currentX += tableColumnWidths[1];
        
        doc.text(item.sku, currentX, currentY, { width: tableColumnWidths[2], align: 'left' });
        currentX += tableColumnWidths[2];
        
        doc.text(item.quantity.toString(), currentX, currentY, { width: tableColumnWidths[3], align: 'left' });
        currentX += tableColumnWidths[3];
        
        doc.text(`₹${item.price.toLocaleString()}`, currentX, currentY, { width: tableColumnWidths[4], align: 'left' });
        currentX += tableColumnWidths[4];
        
        doc.text(item.category, currentX, currentY, { width: tableColumnWidths[5], align: 'left' });
        currentX += tableColumnWidths[5];
        
        doc.text(`₹${item.total.toLocaleString()}`, currentX, currentY, { width: tableColumnWidths[6], align: 'left' });
        
        currentY += 20;
        
        if (index < salesData.length - 1) {
            doc.moveTo(50, currentY - 10).lineTo(550, currentY - 10).stroke();
        }
    });
    

    doc.fontSize(10).text(`Report generated on ${new Date().toLocaleString()}`, 50, 750, { align: 'center' });
    

    doc.end();
};

// Generate Excel report
const generateExcel = async (salesData, res, options = {}) => {
    const { fromDate, toDate } = options;
    
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Elite Wear';
    workbook.created = new Date();
    
    // Add a worksheet
    const worksheet = workbook.addWorksheet('Sales Report');
    
    // Define columns
    worksheet.columns = [
        { header: 'Buyer', key: 'buyer', width: 20 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Product ID', key: 'sku', width: 15 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Price', key: 'price', width: 15 },
        { header: 'Category', key: 'category', width: 15 },
        { header: 'Total', key: 'total', width: 15 },
        { header: 'Date', key: 'orderDate', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 15 }
    ];
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4167B8' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    
    // Add data rows
    salesData.forEach(item => {
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
            paymentMethod: item.paymentMethod
        });
    });
    
    // Add summary information
    const totalSales = salesData.reduce((sum, item) => sum + item.total, 0);
    const totalItems = salesData.reduce((sum, item) => sum + item.quantity, 0);
    
    worksheet.addRow([]);
    worksheet.addRow(['Report Period:', `${fromDate} to ${toDate}`]);
    worksheet.addRow(['Total Sales:', `₹${totalSales.toLocaleString()}`]);
    worksheet.addRow(['Items Sold:', totalItems]);
    worksheet.addRow(['Generated On:', new Date().toLocaleString()]);
    
    // Format currency columns
    worksheet.getColumn('price').numFmt = '₹#,##0.00';
    worksheet.getColumn('total').numFmt = '₹#,##0.00';
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    // Write to response
    await workbook.xlsx.write(res);
};

module.exports = {
    generatePDF,
    generateExcel
};