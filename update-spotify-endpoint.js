const dotenv = require("dotenv");
dotenv.config();
const Request = require("request-promise");
const {Builder, By, Key, until} = require('selenium-webdriver');
const chrome = require("selenium-webdriver/chrome");
const DEFAULT_WAIT_MS = 30000;

/**
 * Updates callback URL in Spotify.
 * @param driver
 * @param ngrokCallbackUrl
 * @returns {Promise<void>}
 */
async function updateSpotifyCallback(driver, ngrokCallbackUrl) {
    await driver.get("https://developer.spotify.com/dashboard/applications/" + process.env.SPOTIFY_CLIENT_ID);

    // may be redirected to login page if we haven't done this before...
    const loginBtn = await driver.wait(until.elementLocated(By.xpath("//button[text()='Log in']")), DEFAULT_WAIT_MS)
        .catch((e) => {
            console.log("login button not found");
            return null;
        });
    if (loginBtn) {
        const mainWindowHandle = await driver.getWindowHandle();
        await loginBtn.click();
        console.info("Waiting for login to Spotify");
        // switch to newly opened window
        const allHandles = await driver.getAllWindowHandles();
        for (let i = 0; i < allHandles.length; i++) {
            if (allHandles[i] != mainWindowHandle) {
                await driver.switchTo().window(allHandles[i]);
            }
        }
        const loginFields = await driver.findElements(By.id("login-username"));
        if (process.env.SPOTIFY_USERNAME && loginFields.length > 0 ) {
            await driver.findElement(By.id("login-username")).sendKeys(process.env.SPOTIFY_USERNAME);
            await driver.findElement(By.id("login-password")).sendKeys(process.env.SPOTIFY_PASSWORD);
            const loginBtn = await driver.findElement(By.id("login-button"));
            await loginBtn.click();
            await driver.wait(until.stalenessOf(loginBtn), DEFAULT_WAIT_MS);
            await driver.switchTo().window(mainWindowHandle);
        }
        await driver.get("https://developer.spotify.com/dashboard/applications/" + process.env.SPOTIFY_CLIENT_ID);
    }

    await driver.wait(until.elementLocated(By.xpath("//a[text()='Settings']")), DEFAULT_WAIT_MS).click();
    const editBtn = await driver.wait(until.elementLocated(By.xpath("//button[span[text()='Edit']]")), DEFAULT_WAIT_MS);
    await driver.executeScript("arguments[0].scrollIntoView(true);", editBtn);
    await editBtn.click();
    const newRedirectUri = await driver.wait(until.elementLocated(By.id("newRedirectUri")), DEFAULT_WAIT_MS);

    // remove previous ngrok binding(s)
    const prevBindings = await driver.findElements(By.xpath("//li[span[contains(text(), 'ngrok-free')]]/button"));
    for (const prevBinding of prevBindings) {
        await driver.executeScript("arguments[0].scrollIntoView(true);", prevBinding);
        await prevBinding.click();
    }

    // add new binding
    newRedirectUri.sendKeys(ngrokCallbackUrl);
    const addRedirectUriBtn = await driver.findElement(By.xpath("//button[@aria-label='Add redirect URI']"));
    await driver.executeScript("arguments[0].scrollIntoView(true);", addRedirectUriBtn);
    await addRedirectUriBtn.click();

    const saveBtn = await driver.findElement(By.xpath("//button[span[text()='Save']]"));
    await driver.executeScript("arguments[0].scrollIntoView(true);", saveBtn);
    await saveBtn.click();
    await new Promise(resolve => setTimeout(resolve, 10000)); // delay before quitting to confirm save
}

(async () => {

    // first check if ngrok is running
    await Promise.resolve(Request({uri: "http://127.0.0.1:" + process.env.NGROK_PORT + "/inspect/http"})
        .catch(error => { console.error("Is ngrok running? " + error); process.exit(1); } ));

    const chromeOptions = new chrome.Options();
    for( const opt of process.env.CHROME_OPTIONS.split(' ') ) {
        chromeOptions.addArguments(opt);
    }
    const driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();
    try {
        await driver.get("http://localhost:" + process.env.NGROK_PORT + "/status");
        const ngrok_url = await driver.wait(until.elementLocated(By.xpath(
            "//h4[text()='meta' or text()='command_line']/../div/table/tbody/tr[th[text()='URL']]/td")), DEFAULT_WAIT_MS).getText();
        console.log("ngrok URL: " + ngrok_url);

        console.log("Updating callback URL in Spotify...");
        await updateSpotifyCallback(driver, ngrok_url + "/spotify");

        console.log("Run 'npm start' now.");

    } catch (error) {
        console.error(error);
    } finally {
        await driver.quit();
    }
})();
