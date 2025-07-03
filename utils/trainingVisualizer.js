const fs = require('fs');
const path = require('path');

module.exports.generateTrainingChart = async (history) => {
  try {
    // Only proceed if we're in Node.js environment
    if (typeof process === 'undefined' || typeof window !== 'undefined') {
      return null;
    }
    
    // Dynamic import of nodeplotlib
    const { plot } = await import('nodeplotlib');
    
    const epochs = Array.from({length: history.history.loss.length}, (_, i) => i + 1);
    
    const data = [
      {
        x: epochs,
        y: history.history.loss,
        type: 'line',
        name: 'Training Loss',
        line: { color: '#1f77b4' }
      },
      {
        x: epochs,
        y: history.history.val_loss,
        type: 'line',
        name: 'Validation Loss',
        line: { color: '#ff7f0e' }
      }
    ];
    
    const layout = {
      title: 'Model Training Progress',
      xaxis: { 
        title: 'Epoch',
        gridcolor: '#e0e0e0'
      },
      yaxis: { 
        title: 'Loss',
        gridcolor: '#e0e0e0'
      },
      plot_bgcolor: '#f5f5f5',
      paper_bgcolor: '#ffffff',
      font: { family: 'Arial, sans-serif' }
    };
    
    // Create HTML content
    const chartHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Model Training Progress</title>
  <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #333; }
    .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Model Training Progress</h1>
    <div class="info">
      Final Training Loss: ${history.history.loss[history.history.loss.length - 1].toFixed(4)}<br>
      Final Validation Loss: ${history.history.val_loss[history.history.val_loss.length - 1].toFixed(4)}<br>
      Epochs: ${history.history.loss.length}
    </div>
    <div id="chart"></div>
  </div>
  
  <script>
    const data = ${JSON.stringify(data)};
    const layout = ${JSON.stringify(layout)};
    Plotly.newPlot('chart', data, layout, {responsive: true});
    
    // Add resize handler
    window.addEventListener('resize', function() {
      Plotly.Plots.resize(document.getElementById('chart'));
    });
  </script>
</body>
</html>`;
    
    // Ensure public directory exists
    const publicDir = path.join(__dirname, '../public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir);
    }
    
    // Save to file
    const filePath = path.join(publicDir, 'training_chart.html');
    fs.writeFileSync(filePath, chartHtml);
    
    return '/training_chart.html';
  } catch (error) {
    console.error('Could not generate training chart:', error);
    return null;
  }
};
