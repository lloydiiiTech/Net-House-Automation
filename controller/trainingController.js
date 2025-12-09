const CropPredictionService = require('../services/cropPredictionService');
const { firestore } = require('../config/firebase');
const path = require('path');
const fs = require('fs');
const TimeSeriesForecaster = require('../services/timeSeriesForecaster');

exports.recordOutcome = async (req, res) => {
  try {
    const { predictionId, cropId, actualPerformance } = req.body;
    
    if (!predictionId || !cropId || actualPerformance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'predictionId, cropId and actualPerformance are required'
      });
    }
    
    const outcomeId = await CropPredictionService.recordCropOutcome(
      cropId, 
      predictionId, 
      parseFloat(actualPerformance)
    );
    
    res.json({
      success: true,
      outcomeId,
      message: 'Crop outcome recorded successfully'
    });
  } catch (error) {
    console.error('Record outcome error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to record crop outcome'
    });
  }
};

exports.getTrainingStatus = async (req, res) => {
  try {
    // Get count of prediction outcomes
    const outcomesSnapshot = await firestore.collection('prediction_history')
      .where('hasActualOutcome', '==', true)
      .count()
      .get();
    
    const trainingSamples = outcomesSnapshot.data().count;

    // Get count of all predictions
    const predictionsSnapshot = await firestore.collection('prediction_history')
      .count()
      .get();
    
    const totalPredictions = predictionsSnapshot.data().count;

    res.json({
      success: true,
      trainingSamples,
      totalPredictions,
      readyForTraining: trainingSamples >= 50,
      recommendation: trainingSamples >= 100 ? 
        "Ready for full training" : 
        `Collect ${100 - trainingSamples} more samples (${Math.round((trainingSamples/100)*100)}% complete)`
    });
  } catch (error) {
    console.error('Training status error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to get training status'
    });
  }
};

exports.trainModel = async (req, res) => {
  try {
    const result = await CropPredictionService.trainModel();
    
    res.json({ 
      success: true,
      message: 'Model trained successfully',
      samples: result.samples,
      registeredSamples: result.registeredSamples,
      unregisteredSamples: result.unregisteredSamples,
      finalLoss: result.finalLoss.toFixed(4),
      finalValLoss: result.finalValLoss.toFixed(4),
      finalValMae: result.finalValMae.toFixed(4),
      trainingChart: result.trainingChart,
      trainingTime: result.trainingTime,
      validationMetrics: {
        mae: (result.valMAE * 100).toFixed(2) + '%',
        rmse: (result.valRMSE * 100).toFixed(2) + '%',
        accuracy: result.valAccuracy.toFixed(1) + '%',
        epochs: result.epochs
      }
    });
  } catch (error) {
    console.error('Training error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to train model'
    });
  }
};

exports.validateModel = async (req, res) => {
  try {
    const validation = await CropPredictionService.validateModel();
    
    res.json({
      success: true,
      accuracy: validation.accuracy.toFixed(1) + '%',
      meanAbsoluteError: validation.meanAbsoluteError.toFixed(2),
      r2: validation.r2.toFixed(3),
      validationThreshold: validation.validationThreshold,
      samples: validation.samples,
      results: validation.results
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to validate model'
    });
  }
};

exports.getTrainingChart = async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/training_chart.html');
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({
        success: false,
        message: 'Training chart not found'
      });
    }
  } catch (error) {
    console.error('Get chart error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to get training chart'
    });
  }
};

exports.evaluateModel = async (req, res) => {
  try {
    // Get all predictions (avoid index requirement by fetching all and filtering client-side)
    const allPredictionsSnapshot = await firestore.collection('prediction_history')
      .orderBy('timestamp', 'desc')
      .limit(200)
      .get();

    // Filter client-side to avoid index requirement
    const outcomesWithData = [];
    let trainingSamples = 0;

    allPredictionsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.hasActualOutcome === true && data.actualOutcome) {
        trainingSamples++;
        outcomesWithData.push({ id: doc.id, data });
      }
    });

    // Sort by timestamp descending (most recent first)
    outcomesWithData.sort((a, b) => {
      const timeA = a.data.timestamp?.toDate?.()?.getTime() || 0;
      const timeB = b.data.timestamp?.toDate?.()?.getTime() || 0;
      return timeB - timeA;
    });

    // Limit to most recent 100
    const outcomesSnapshot = outcomesWithData.slice(0, 100);

    if (outcomesSnapshot.length === 0) {
      return res.json({
        success: true,
        message: 'No evaluation data available yet. Record some crop outcomes first.',
        hasData: false,
        recommendations: [
          'Plant crops based on predictions',
          'Record actual outcomes after harvest using POST /api/outcomes',
          'Come back after collecting 20+ outcomes'
        ]
      });
    }

    // Analyze predictions vs actuals
    const analyses = [];
    let totalError = 0;
    let correctPredictions = 0;
    const threshold = 15;
    const errorRanges = { excellent: 0, good: 0, fair: 0, poor: 0 };
    const cropPerformance = {};
    const scoreRangePerformance = { high: [], medium: [], low: [] };

    outcomesSnapshot.forEach(({ id, data }) => {
      if (!data.predictions?.topOverall || !data.actualOutcome) return;

      const predicted = data.predictions.topOverall.score;
      const actual = data.actualOutcome.score;
      const error = Math.abs(predicted - actual);
      const cropName = data.predictions.topOverall.name;

      totalError += error;
      if (error <= threshold) correctPredictions++;

      // Categorize error
      if (error <= 5) errorRanges.excellent++;
      else if (error <= 10) errorRanges.good++;
      else if (error <= 15) errorRanges.fair++;
      else errorRanges.poor++;

      // Track crop performance
      if (!cropPerformance[cropName]) {
        cropPerformance[cropName] = { count: 0, totalError: 0, correct: 0 };
      }
      cropPerformance[cropName].count++;
      cropPerformance[cropName].totalError += error;
      if (error <= threshold) cropPerformance[cropName].correct++;

      // Track by predicted score range
      if (predicted >= 70) scoreRangePerformance.high.push({ predicted, actual, error });
      else if (predicted >= 50) scoreRangePerformance.medium.push({ predicted, actual, error });
      else scoreRangePerformance.low.push({ predicted, actual, error });

      analyses.push({
        predictionId: id,
        cropName,
        predicted,
        actual,
        error: Math.round(error),
        withinThreshold: error <= threshold,
        timestamp: data.timestamp?.toDate?.()?.toISOString() || null
      });
    });

    const sampleCount = analyses.length;
    const meanAbsoluteError = totalError / sampleCount;
    const accuracy = (correctPredictions / sampleCount) * 100;
    const rmse = Math.sqrt(
      analyses.reduce((sum, a) => sum + Math.pow(a.error, 2), 0) / sampleCount
    );

    // Calculate crop-specific accuracy
    const cropStats = Object.entries(cropPerformance).map(([name, stats]) => ({
      name,
      samples: stats.count,
      avgError: Math.round((stats.totalError / stats.count) * 10) / 10,
      accuracy: Math.round((stats.correct / stats.count) * 100),
      performance: stats.correct / stats.count >= 0.7 ? 'good' : 
                   stats.correct / stats.count >= 0.5 ? 'fair' : 'poor'
    })).sort((a, b) => b.samples - a.samples);

    // Score range analysis
    const rangeStats = {
      high: {
        count: scoreRangePerformance.high.length,
        avgError: scoreRangePerformance.high.length > 0
          ? Math.round((scoreRangePerformance.high.reduce((s, r) => s + r.error, 0) / scoreRangePerformance.high.length) * 10) / 10
          : 0,
        accuracy: scoreRangePerformance.high.length > 0
          ? Math.round((scoreRangePerformance.high.filter(r => r.error <= threshold).length / scoreRangePerformance.high.length) * 100)
          : 0
      },
      medium: {
        count: scoreRangePerformance.medium.length,
        avgError: scoreRangePerformance.medium.length > 0
          ? Math.round((scoreRangePerformance.medium.reduce((s, r) => s + r.error, 0) / scoreRangePerformance.medium.length) * 10) / 10
          : 0,
        accuracy: scoreRangePerformance.medium.length > 0
          ? Math.round((scoreRangePerformance.medium.filter(r => r.error <= threshold).length / scoreRangePerformance.medium.length) * 100)
          : 0
      },
      low: {
        count: scoreRangePerformance.low.length,
        avgError: scoreRangePerformance.low.length > 0
          ? Math.round((scoreRangePerformance.low.reduce((s, r) => s + r.error, 0) / scoreRangePerformance.low.length) * 10) / 10
          : 0,
        accuracy: scoreRangePerformance.low.length > 0
          ? Math.round((scoreRangePerformance.low.filter(r => r.error <= threshold).length / scoreRangePerformance.low.length) * 100)
          : 0
      }
    };

    // Overall assessment
    let overallGrade = 'F';
    let assessment = 'Model needs significant improvement';
    if (accuracy >= 80 && meanAbsoluteError < 8) {
      overallGrade = 'A';
      assessment = 'Excellent model performance';
    } else if (accuracy >= 70 && meanAbsoluteError < 10) {
      overallGrade = 'B';
      assessment = 'Good model performance';
    } else if (accuracy >= 60 && meanAbsoluteError < 12) {
      overallGrade = 'C';
      assessment = 'Fair model performance';
    } else if (accuracy >= 50 && meanAbsoluteError < 15) {
      overallGrade = 'D';
      assessment = 'Model needs improvement';
    }

    // Recommendations
    const recommendations = [];
    if (sampleCount < 50) {
      recommendations.push(`Collect more training data (currently ${sampleCount}, aim for 50+)`);
    }
    if (accuracy < 70) {
      recommendations.push('Model accuracy is below 70%. Consider retraining with more diverse data.');
    }
    if (meanAbsoluteError > 10) {
      recommendations.push('Mean absolute error is high. Review prediction patterns and data quality.');
    }
    const worstCrops = cropStats.filter(c => c.performance === 'poor').slice(0, 3);
    if (worstCrops.length > 0) {
      recommendations.push(`Review predictions for: ${worstCrops.map(c => c.name).join(', ')}`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Model is performing well! Continue collecting data for ongoing improvement.');
    }

    res.json({
      success: true,
      hasData: true,
      summary: {
        overallGrade,
        assessment,
        sampleCount,
        accuracy: Math.round(accuracy * 10) / 10,
        meanAbsoluteError: Math.round(meanAbsoluteError * 10) / 10,
        rmse: Math.round(rmse * 10) / 10,
        threshold: `±${threshold} points`
      },
      errorDistribution: {
        excellent: errorRanges.excellent,
        good: errorRanges.good,
        fair: errorRanges.fair,
        poor: errorRanges.poor
      },
      scoreRangeAnalysis: rangeStats,
      cropPerformance: cropStats,
      trainingData: {
        samples: trainingSamples,
        status: trainingSamples >= 100 ? 'sufficient' : trainingSamples >= 50 ? 'adequate' : 'insufficient'
      },
      recommendations,
      recentResults: analyses.slice(0, 10).sort((a, b) => b.error - a.error)
    });

  } catch (error) {
    console.error('Evaluation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to evaluate model'
    });
  }
};

exports.getTrainingTrials = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const result = await CropPredictionService.getTrainingTrials(limit);
    
    // Analyze trials to provide insights
    const insights = {
      totalTrials: result.totalTrials,
      hasBestTrial: result.bestTrial !== null,
      bestTrialMetrics: result.bestTrial ? {
        trialId: result.bestTrial.trialId,
        trialScore: result.bestTrial.trialScore,
        accuracy: result.bestTrial.metrics.valAccuracy,
        mae: result.bestTrial.metrics.valMAE,
        rmse: result.bestTrial.metrics.valRMSE,
        samples: result.bestTrial.metrics.samples,
        trainedAt: result.bestTrial.trainedAt
      } : null,
      recentImprovement: null,
      recommendations: []
    };

    // Check if recent trials are improving
    if (result.trials.length >= 2) {
      const recent = result.trials[0];
      const previous = result.trials[1];
      
      if (recent.metrics.valAccuracy > previous.metrics.valAccuracy) {
        insights.recentImprovement = {
          trend: 'improving',
          accuracyGain: (recent.metrics.valAccuracy - previous.metrics.valAccuracy).toFixed(1),
          message: `Model accuracy improved by ${(recent.metrics.valAccuracy - previous.metrics.valAccuracy).toFixed(1)}% in latest trial`
        };
      } else if (recent.metrics.valAccuracy < previous.metrics.valAccuracy) {
        insights.recentImprovement = {
          trend: 'declining',
          accuracyLoss: (previous.metrics.valAccuracy - recent.metrics.valAccuracy).toFixed(1),
          message: `Model accuracy decreased by ${(previous.metrics.valAccuracy - recent.metrics.valAccuracy).toFixed(1)}% in latest trial`
        };
      } else {
        insights.recentImprovement = {
          trend: 'stable',
          message: 'Model performance is stable'
        };
      }
    }

    // Generate recommendations
    if (result.bestTrial) {
      const best = result.bestTrial;
      const latest = result.trials[0];
      
      if (latest.trialScore < best.trialScore) {
        insights.recommendations.push(
          `Best trial (${best.trialId.substring(0, 8)}...) has better performance. Consider using that model version.`
        );
      }
      
      if (best.metrics.samples < 100) {
        insights.recommendations.push(
          `Best trial used only ${best.metrics.samples}. Collect more data for better accuracy.`
        );
      }
    }

    if (result.trials.length < 5) {
      insights.recommendations.push(
        'You have few training trials. More trials help identify the best model configuration.'
      );
    }

    res.json({
      success: true,
      ...result,
      insights
    });

  } catch (error) {
    console.error('Get training trials error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to get training trials'
    });
  }
};

exports.getBestTrial = async (req, res) => {
  try {
    const bestTrial = await CropPredictionService.getBestTrial();
    
    if (!bestTrial) {
      return res.json({
        success: true,
        message: 'No training trials available yet. Train the model first.',
        hasBestTrial: false
      });
    }

    // Provide insights based on the best trial
    const insights = {
      performanceGrade: this.calculatePerformanceGrade(bestTrial.metrics.valAccuracy, bestTrial.metrics.valMAE),
      strengths: [],
      recommendations: []
    };

    // Analyze strengths
    if (bestTrial.metrics.valAccuracy >= 80) {
      insights.strengths.push('High prediction accuracy');
    }
    if (bestTrial.metrics.valMAE <= 0.1) {
      insights.strengths.push('Low mean absolute error');
    }
    if (bestTrial.metrics.samples >= 100) {
      insights.strengths.push('Trained on substantial dataset');
    }

    // Generate recommendations
    if (bestTrial.metrics.valAccuracy < 70) {
      insights.recommendations.push('Consider collecting more diverse training data');
    }
    if (bestTrial.metrics.samples < 50) {
      insights.recommendations.push('Train with more samples for better generalization');
    }
    if (bestTrial.metrics.valMAE > 0.15) {
      insights.recommendations.push('Model may benefit from additional feature engineering');
    }

    res.json({
      success: true,
      hasBestTrial: true,
      bestTrial,
      insights,
      comparison: {
        vsAverage: this.compareToAveragePerformance(bestTrial)
      }
    });
  } catch (error) {
    console.error('Get best trial error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to get best trial'
    });
  }
};

exports.calculatePerformanceGrade = (accuracy, mae) => {
  if (accuracy >= 85 && mae <= 0.08) return 'A+';
  if (accuracy >= 80 && mae <= 0.1) return 'A';
  if (accuracy >= 75 && mae <= 0.12) return 'B+';
  if (accuracy >= 70 && mae <= 0.15) return 'B';
  if (accuracy >= 60 && mae <= 0.2) return 'C';
  return 'D';
};

exports.compareToAveragePerformance = (bestTrial) => {
  // This would require fetching all trials and calculating averages
  // For now, return a placeholder
  return {
    accuracyVsAverage: 'Above average', // Implement actual comparison
    maeVsAverage: 'Below average'
  };
};

exports.getLatestForecast = async (req, res) => {
  try {
    const forecast = await TimeSeriesForecaster.getLatestForecast();
    if (!forecast) {
      return res.json({ success: true, message: 'No forecast available yet' });
    }
    res.json({ success: true, data: forecast });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getForecastsPage = async (req, res) => {
  try {
    const forecast = await TimeSeriesForecaster.getLatestForecast();
    res.render('forecasts', { 
      forecast, 
      title: 'Sensor Forecasts',
      user: req.session.user || null 
    });
  } catch (error) {
    console.error('Forecasts page error:', error);
    res.render('error', { 
      message: 'Failed to load forecasts', 
      error: error,
      timestamp: new Date().toISOString()
    });
  }
};


