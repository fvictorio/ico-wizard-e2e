const path = require('path');
const puppeteer = require('puppeteer');

// Make this work when doing .load from node REPL
var __dirname = __dirname || '.'

// Useful for handling promises in REPL
const def = (x) => global.x = x

const metamaskPath = path.join(__dirname, 'metamask/3.13.4_0');
const METAMASK_EXTENSION_URL =
  process.env.METAMASK_EXTENSION_URL || 'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/popup.html';
const ICO_WIZARD_URL = process.env.ICO_WIZARD_URL || 'https://wizard.poa.network'

const timeoutMs = milliseconds => new Promise(res => setTimeout(res, milliseconds));
const timeout = seconds => timeoutMs(seconds * 1000)

let browser = null;
let metamask = null;
let wizard = null;

async function reloadUntil(page, selector, interval = 100) {
  return page.$(selector)
    .then((element) => {
      if (element) return element
      return page.reload().then(() => timeoutMs(interval))
        .then(() => reloadUntil(page, selector, interval))
    })
}

async function acceptTransactions(metamask, options = {}) {
  const defaultOptions = { waitTime: 100, maxAttempts: 60, isFinished: () => false }
  options = {...defaultOptions, ...options}
  let attempts = 0

  while (attempts <= options.maxAttempts && !(await options.isFinished())) {
    await timeoutMs(100)
    await metamask.reload()
    await timeoutMs(100)

    const submit = await metamask.$('input[type="submit"]')
    if (submit) {
      await submit.click()
      attempts = 0
    } else {
      attempts++
    }
  }

  return Promise.resolve()
}

async function main() {
  browser = await puppeteer.launch({
    headless: false,
    args: [`--disable-extensions-except=${metamaskPath}`, `--load-extension=${metamaskPath}`],
  });

  // Open MetaMask popup in a new tab
  metamask = await browser.newPage();
  await metamask.goto(METAMASK_EXTENSION_URL);

  // Accept terms
  await timeout(3);
  const acceptButton = await metamask.$('button');
  acceptButton.click();
  await timeout(1);
  const termsOfUse = await metamask.$('div.markdown');
  await metamask.evaluate(termsOfUse => {
    termsOfUse.scrollTo(0, termsOfUse.scrollHeight);
  }, termsOfUse);
  const acceptButton2 = await metamask.$('button');
  acceptButton2.click();

  // Select localhost
  await timeout(1);
  (await metamask.$('div.network-indicator')).click();
  await timeout(1);
  const localhostIndex = await metamask.$$eval('li.dropdown-menu-item', lis => {
    return lis.findIndex(li => li.innerHTML.includes('8545'));
  });
  const localhost = await metamask.$$('li.dropdown-menu-item').then(xs => xs[localhostIndex]);
  localhost.click();
  await metamask.$('p.pointer').then(x => x.click());

  // Insert seed phrase and password
  await metamask
    .$('textarea')
    .then(txt => txt.type('myth like bonus scare over problem client lizard pioneer submit female collect'));
  await metamask.$('#password-box').then(p => p.type('password'));
  await metamask.$('#password-box-confirm').then(p => p.type('password'));

  await metamask
    .$$('button')
    .then(xs => xs[1])
    .then(x => x.click());

  // Go to ICO Wizard
  wizard = await browser.newPage();
  await wizard.goto(ICO_WIZARD_URL);
  await wizard.setViewport({
    width: 1200,
    height: 800
  })

  // Go to step 1
  await wizard.waitForSelector('span.button')
  await wizard.$('span.button').then(x => x.click())
  await timeout(3)

  // Go to step 2
  await wizard.waitForSelector('span.button')
  await wizard.$('span.button').then(x => x.click())

  // Fill name, ticker and decimals
  await wizard.waitForSelector('.reserved-tokens-input-property')
  const step2TextInputs = await wizard.$$('input[type="text"]')
  await step2TextInputs[0].type('My Token')
  await step2TextInputs[1].type('MTK')
  await wizard.$('input[type="number"]').then(x => x.type('12'))

  // Go to step 3
  await wizard.$('a.button').then(x => x.click())

  // Fill rate and supply
  await wizard.waitForSelector('.button.button_fill_secondary')
  const step3Inputs = await wizard.$$('input[type="number"]')
  await step3Inputs[1].type('1000')
  await step3Inputs[2].type('1000')

  // Go to step 4
  await timeout(1)
  await wizard.$('a.button').then(x => x.click())

  // Reload metamask and submit the transaction
  await timeout(1)
  await acceptTransactions(metamask, {
    isFinished: () => wizard.$('.loading-container.notdisplayed')
  })

  browser.close()
}

process.on('unhandledRejection', r => console.log(r));

if (require.main === module) {
  main();
}
