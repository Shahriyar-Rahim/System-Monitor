const { contextBridge } = require("electron");


contextBridge.executeInMainWorld('monitorApi', {
    
})