// automation.js - Módulo de automação do Travian usando Puppeteer
require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configurações e constantes
const TRAVIAN_URL = 'https://ts100.x10.america.travian.com';
const FARM_LIST_URL = `${TRAVIAN_URL}/build.php?gid=16&tt=99`;
const CREDENTIALS_FILE = path.join(__dirname, 'credentials.json');

// Variáveis de controle do estado da automação
let isRunning = false;
let nextRunTimeout = null;
let nextRunTime = null;

// Função para carregar credenciais do arquivo
function loadCredentials() {
    try {
        if (fs.existsSync(CREDENTIALS_FILE)) {
            const data = fs.readFileSync(CREDENTIALS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Erro ao carregar credenciais:', error);
    }
    return null;
}

// Função para salvar credenciais no arquivo
function saveCredentials(username, password) {
    try {
        const data = JSON.stringify({ username, password });
        fs.writeFileSync(CREDENTIALS_FILE, data, 'utf8');
        return true;
    } catch (error) {
        console.error('Erro ao salvar credenciais:', error);
        return false;
    }
}

// Função para gerar atraso aleatório entre execuções
function getRandomDelay(minMinutes, maxMinutes) {
    const minMs = minMinutes * 60 * 1000;
    const maxMs = maxMinutes * 60 * 1000;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

// Função principal de automação
async function runAutomation() {
    // Carregar credenciais
    const credentials = loadCredentials();
    if (!credentials || !credentials.username || !credentials.password) {
        console.error('Credenciais não encontradas. Por favor, configure o usuário e senha na interface web.');
        return;
    }

    let browser = null;
    console.log(`[${new Date().toISOString()}] Iniciando automação da lista de farms do Travian...`);

    try {
        console.log('Iniciando navegador...');
        // Configuração para rodar no Render.com
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--no-sandbox',
                '--disable-gpu'
            ]
        });
        console.log('Navegador iniciado com sucesso!');

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });
        console.log('Página do navegador criada.');

        // --- Login --- 
        console.log(`Navegando para página de login: ${TRAVIAN_URL}/login.php`);
        await page.goto(`${TRAVIAN_URL}/login.php`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log('Página de login carregada.');

        console.log('Inserindo nome de usuário...');
        await page.type('input[name="name"]', credentials.username);
        console.log('Inserindo senha...');
        await page.type('input[name="password"]', credentials.password);

        console.log('Enviando formulário de login...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 90000 }).catch(() => {
                console.log('Timeout ao esperar redirecionamento, mas continuando...');
            }),
            page.click('button[type="submit"], input[type="submit"]')
        ]);
        
        // Verificar se o login foi bem-sucedido
        const currentUrl = page.url();
        if (currentUrl.includes('dorf1.php') || currentUrl.includes('dorf2.php')) {
            console.log('Login bem-sucedido, redirecionado para página principal.');
        } else {
            console.warn('Possível falha no login. URL atual:', currentUrl);
            // Tentar continuar mesmo assim
        }

        // --- Navegar para Lista de Farms --- 
        console.log(`Navegando para página da lista de farms: ${FARM_LIST_URL}`);
        await page.goto(FARM_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
        console.log('Página da lista de farms carregada.');

        // --- Clicar no Botão --- 
        console.log('Procurando botão da lista de farms...');
        
        // Tentar diferentes métodos para encontrar e clicar no botão
        const buttonFound = await page.evaluate(() => {
            // Método 1: Procurar por div com texto específico
            const buttons = Array.from(document.querySelectorAll('div'));
            const farmButton = buttons.find(el => el.textContent.includes('Iniciar todas as listas de farms'));
            
            if (farmButton) {
                farmButton.click();
                return true;
            }
            
            // Método 2: Procurar por classe específica
            const classButton = document.querySelector('div.startAllFarmLists');
            if (classButton) {
                classButton.click();
                return true;
            }
            
            return false;
        });
        
        if (buttonFound) {
            console.log('Botão da lista de farms clicado com sucesso!');
            await page.waitForTimeout(5000);
        } else {
            console.warn('Botão "Iniciar todas as listas de farms" não encontrado ou não visível.');
        }

        console.log('Etapa de automação concluída.');

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro durante a automação:`, error);
    } finally {
        if (browser) {
            try {
                console.log('Fechando navegador...');
                await browser.close();
                console.log('Navegador fechado.');
            } catch (closeError) {
                console.error('Erro ao fechar navegador:', closeError);
            }
        }
        console.log(`[${new Date().toISOString()}] Execução da automação finalizada.`);
        
        // Agendar próxima execução apenas se a automação ainda estiver ativa
        if (isRunning) {
            scheduleNextRun();
        } else {
            console.log('Automação está pausada. Não agendando próxima execução.');
        }
    }
}

// Função para agendar a próxima execução
function scheduleNextRun() {
    if (!isRunning) {
        console.log('Automação está pausada. Não agendando próxima execução.');
        return;
    }
    
    const delay = getRandomDelay(4, 6); // Atraso aleatório entre 4 e 6 minutos
    nextRunTime = new Date(Date.now() + delay);
    
    console.log(`--------------------------------------------------`);
    console.log(`Próxima execução agendada para: ${nextRunTime.toISOString()}`);
    console.log(`Aguardando ${Math.round(delay / 60000)} minutos (${delay} ms)...`);
    console.log(`--------------------------------------------------`);

    // Limpar qualquer timeout existente antes de criar um novo
    if (nextRunTimeout) {
        clearTimeout(nextRunTimeout);
    }
    
    nextRunTimeout = setTimeout(runAutomation, delay);
}

// Funções para controlar a automação externamente
function startAutomation() {
    // Verificar se as credenciais existem
    const credentials = loadCredentials();
    if (!credentials || !credentials.username || !credentials.password) {
        return { 
            success: false, 
            message: 'Credenciais não configuradas. Por favor, configure o usuário e senha na interface web.',
            status: getStatus()
        };
    }

    if (isRunning) {
        return { success: false, message: 'A automação já está em execução.' };
    }
    
    isRunning = true;
    console.log('Automação iniciada pelo usuário.');
    
    // Iniciar imediatamente
    runAutomation();
    
    return { 
        success: true, 
        message: 'Automação iniciada com sucesso!',
        status: getStatus()
    };
}

function stopAutomation() {
    if (!isRunning) {
        return { success: false, message: 'A automação já está parada.' };
    }
    
    isRunning = false;
    
    // Cancelar próxima execução agendada
    if (nextRunTimeout) {
        clearTimeout(nextRunTimeout);
        nextRunTimeout = null;
    }
    
    console.log('Automação parada pelo usuário.');
    
    return { 
        success: true, 
        message: 'Automação parada com sucesso!',
        status: getStatus()
    };
}

function getStatus() {
    const credentials = loadCredentials();
    const hasCredentials = !!(credentials && credentials.username && credentials.password);
    
    return {
        isRunning,
        nextRunTime: nextRunTime ? nextRunTime.toISOString() : null,
        timeRemaining: nextRunTime ? Math.max(0, nextRunTime - Date.now()) : null,
        hasCredentials,
        username: hasCredentials ? credentials.username : null
    };
}

function updateCredentials(username, password) {
    if (!username || !password) {
        return {
            success: false,
            message: 'Usuário e senha são obrigatórios.'
        };
    }
    
    const saved = saveCredentials(username, password);
    
    if (saved) {
        return {
            success: true,
            message: 'Credenciais salvas com sucesso!',
            status: getStatus()
        };
    } else {
        return {
            success: false,
            message: 'Erro ao salvar credenciais. Tente novamente.'
        };
    }
}

// Exportar funções para uso no servidor
module.exports = {
    startAutomation,
    stopAutomation,
    getStatus,
    updateCredentials
};
