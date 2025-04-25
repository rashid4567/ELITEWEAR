const generateOrderNumber = () => {
    const prefix = 'EW';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${timestamp}${random}`;
};


const generateTransactionId = () => {
    const prefix = 'TXN';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${timestamp}${random}`;
};

module.exports = {
    generateOrderNumber,
    generateTransactionId
};