# Crop Prediction Model Evaluation Guide

## How to Know if Your Model is Accurate

### 1. **Check Training Status**
```bash
GET /api/training/status
```
**What it tells you:**
- How many training samples you have
- Whether you have enough data (need 50+ for basic training, 100+ for good training)
- Progress toward having enough data

**Good indicators:**
- ✅ 100+ samples with actual outcomes
- ✅ Mix of registered and unregistered crops
- ✅ Diverse crop types and conditions

---

### 2. **Validate Model Performance**
```bash
GET /api/training/validate
```
**What it tells you:**
- **Accuracy**: % of predictions within ±15 points of actual
- **Mean Absolute Error (MAE)**: Average prediction error
- **Individual results**: See which predictions were close/far

**Good indicators:**
- ✅ Accuracy > 70% (predictions within ±15 points)
- ✅ MAE < 10 points
- ✅ Most predictions within threshold

**Example response:**
```json
{
  "accuracy": "75.5%",
  "meanAbsoluteError": 8.3,
  "samples": 50,
  "results": [
    {
      "predicted": 72,
      "actual": 68,
      "error": 4,
      "withinThreshold": true
    }
  ]
}
```

---

### 3. **Track Prediction vs Reality**

#### Step 1: Get Predictions
```bash
GET /predict
```
Save the `predictionId` from the response.

#### Step 2: Plant the Recommended Crop
Use the top recommended crop from predictions.

#### Step 3: Record Actual Outcome
After harvest, record the actual performance:
```bash
POST /api/outcomes
{
  "predictionId": "abc123",
  "cropId": "crop456",
  "actualPerformance": 75  // 0-100 scale
}
```

#### Step 4: Compare
- **Good prediction**: Predicted score ≈ Actual performance (±15 points)
- **Needs improvement**: Error > 15 points

---

### 4. **Monitor Training Metrics**
```bash
GET /api/training/train
```
**Key metrics to watch:**
- **Validation Loss**: Lower is better (should decrease during training)
- **Validation MAE**: Should be < 10% ideally
- **Accuracy**: Should be > 70%
- **Training Chart**: Visualize loss curves at `/training-chart`

**Red flags:**
- ❌ Validation loss not decreasing
- ❌ Validation loss much higher than training loss (overfitting)
- ❌ Accuracy < 50%

---

## Best Practices for Improving Predictions

### 1. **Collect More Training Data**
- Record outcomes for **every** crop you plant
- Aim for **100+ samples** minimum
- Include diverse conditions (different seasons, sensor readings)

### 2. **Regular Retraining**
- Retrain after every **20-30 new outcomes**
- Model automatically retrains when new harvested crops are detected
- Check training metrics after each retrain

### 3. **Validate Regularly**
- Run validation weekly/monthly
- Track accuracy trends over time
- Identify patterns in prediction errors

### 4. **Review Failed Predictions**
Look at validation results to find:
- Which crops are consistently over/under-predicted
- Which sensor conditions lead to errors
- Whether certain crop types are harder to predict

### 5. **Check Parameter Matches**
In prediction results, check `parameterMatches`:
- Crops with many parameters < 50% match → likely poor predictions
- Crops with most parameters > 70% match → likely good predictions
- Use this to understand why certain crops are recommended

---

## Evaluation Checklist

### Before Using Predictions:
- [ ] Model is trained (`isTrained: true` in modelInfo)
- [ ] Have 50+ training samples
- [ ] Validation accuracy > 60%
- [ ] Validation MAE < 15

### During Use:
- [ ] Record actual outcomes for every crop
- [ ] Compare predicted vs actual scores
- [ ] Note any consistent errors

### Monthly Review:
- [ ] Retrain model with new data
- [ ] Check validation metrics
- [ ] Review prediction accuracy trends
- [ ] Adjust if accuracy drops

---

## Understanding Prediction Quality

### In Prediction Results:
Check `predictionQuality` field:
```json
{
  "quality": "excellent|good|fair|poor",
  "dataCompleteness": 100,
  "avgRegisteredScore": 45,
  "scoreVariance": 5
}
```

**Quality levels:**
- **Excellent**: avgScore ≥ 80, variance < 400
- **Good**: avgScore ≥ 60, variance < 600
- **Fair**: avgScore ≥ 40, variance < 800
- **Poor**: Below fair thresholds

**What it means:**
- Higher average scores = better overall crop matches
- Lower variance = more consistent predictions
- 100% data completeness = all sensors working

---

## Troubleshooting Poor Predictions

### If Accuracy is Low (< 60%):
1. **Check training data quality**
   - Are `harvestSuccessRate` values accurate?
   - Are sensor summaries complete?
   - Do you have enough diverse samples?

2. **Check for data issues**
   - Missing sensor data?
   - Outlier values in training data?
   - Inconsistent crop optimal values?

3. **Retrain with more data**
   - Collect 50+ more samples
   - Retrain model
   - Validate again

### If Predictions Seem Wrong:
1. **Check parameterMatches**
   - Are recommended crops actually well-matched?
   - Do top crops have good parameter matches?

2. **Check sensor data**
   - Is 31-day average accurate?
   - Are sensors calibrated correctly?

3. **Review rule-based vs ML scores**
   - If `mlScore` is very different from `ruleBasedScore`, ML might need more training
   - If both are similar, the environment might genuinely be poor for all crops

---

## Success Metrics

### Excellent Model Performance:
- ✅ Validation accuracy > 80%
- ✅ MAE < 8 points
- ✅ Top recommended crop actually performs well (70%+ success rate)
- ✅ Predictions improve over time as more data is collected

### Good Model Performance:
- ✅ Validation accuracy 70-80%
- ✅ MAE 8-12 points
- ✅ Top recommended crop performs reasonably (60%+ success rate)

### Needs Improvement:
- ⚠️ Validation accuracy < 70%
- ⚠️ MAE > 12 points
- ⚠️ Top recommended crops don't perform well

---

## Next Steps

1. **Start tracking**: Record outcomes for every crop
2. **Build dataset**: Aim for 100+ samples
3. **Regular validation**: Check accuracy monthly
4. **Iterate**: Retrain and improve based on results

The more actual outcomes you record, the better your predictions will become!

