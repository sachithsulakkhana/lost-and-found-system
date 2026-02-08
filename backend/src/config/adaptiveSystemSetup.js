/**
 * ADAPTIVE SYSTEM SETUP
 *
 * Initialize and configure the real-time adaptive learning system
 */

const { getModel } = require('../services/adaptiveLearningService');
const { getProcessor } = require('../services/realTimeStreamService');

/**
 * Initialize the adaptive learning system
 */
async function initializeAdaptiveSystem() {
    console.log('========================================');
    console.log('INITIALIZING ADAPTIVE LEARNING SYSTEM');
    console.log('========================================');

    try {
        // 1. Initialize the model (loads historical patterns)
        console.log('1. Loading adaptive model...');
        const model = getModel();
        await model.loadPatterns();
        console.log('   ✓ Model loaded with historical patterns');

        // 2. Start the real-time stream processor
        console.log('2. Starting real-time stream processor...');
        const processor = getProcessor();
        processor.start();
        console.log('   ✓ Stream processor running');

        // 3. Run initial risk assessment for all zones
        console.log('3. Running initial risk assessment...');
        const predictions = await model.predictAllZones();
        console.log(`   ✓ Generated predictions for ${predictions.length} zones`);

        // Display summary
        console.log('\n========================================');
        console.log('ADAPTIVE SYSTEM STATUS');
        console.log('========================================');
        console.log(`Model Version: ${predictions[0]?.modelVersion || 'adaptive-v1'}`);
        console.log(`Learning Rate: ${model.learningRate.toFixed(3)}`);
        console.log(`Zones Monitored: ${predictions.length}`);
        console.log(`Stream Processor: RUNNING`);
        console.log('========================================\n');

        // Log risk summary
        const riskSummary = {
            LOW: 0,
            MEDIUM: 0,
            HIGH: 0,
            CRITICAL: 0
        };

        predictions.forEach(p => {
            riskSummary[p.riskLevel]++;
        });

        console.log('Current Risk Distribution:');
        console.log(`  LOW: ${riskSummary.LOW} zones`);
        console.log(`  MEDIUM: ${riskSummary.MEDIUM} zones`);
        console.log(`  HIGH: ${riskSummary.HIGH} zones`);
        console.log(`  CRITICAL: ${riskSummary.CRITICAL} zones`);
        console.log('');

        return {
            success: true,
            model,
            processor,
            predictions
        };
    } catch (error) {
        console.error('❌ Failed to initialize adaptive system:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Graceful shutdown
 */
function shutdownAdaptiveSystem() {
    console.log('Shutting down adaptive learning system...');

    try {
        const processor = getProcessor();
        processor.stop();
        console.log('✓ Stream processor stopped');
    } catch (error) {
        console.error('Error during shutdown:', error);
    }
}

module.exports = {
    initializeAdaptiveSystem,
    shutdownAdaptiveSystem
};
