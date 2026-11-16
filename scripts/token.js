import '../env.js';
if(!process.env.SETUP_TOKEN)throw Error('No setup token found. Run the installation setup first.');
console.log(process.env.SETUP_TOKEN);
