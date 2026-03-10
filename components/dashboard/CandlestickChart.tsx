'use client';

import { memo, useEffect, useRef } from 'react';
import { CandleData, PredictionResult } from '@/lib/types';
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
  ISeriesMarkersPluginApi,
} from 'lightweight-charts';

interface CandlestickChartProps {
  candles: CandleData[];
  predictions: PredictionResult[];
}

function toChartTime(timestamp: number): Time {
  return (timestamp / 1000) as Time;
}

export const CandlestickChart = memo(function CandlestickChart({ candles, predictions }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#666666',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(0, 255, 65, 0.03)' },
        horzLines: { color: 'rgba(0, 255, 65, 0.03)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(0, 255, 65, 0.3)', labelBackgroundColor: '#111' },
        horzLine: { color: 'rgba(0, 255, 65, 0.3)', labelBackgroundColor: '#111' },
      },
      rightPriceScale: {
        borderColor: 'rgba(0, 255, 65, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(0, 255, 65, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00ff41',
      downColor: '#ff4444',
      borderUpColor: '#00ff41',
      borderDownColor: '#ff4444',
      wickUpColor: '#00ff41',
      wickDownColor: '#ff4444',
    });

    const markers = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = markers;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const chartData: CandlestickData<Time>[] = candles.map(c => ({
      time: toChartTime(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(chartData);

    // Auto-scroll to show latest candle
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }

    // Add prediction markers
    if (markersRef.current) {
      const markerData = predictions
        .filter(p => p.outcome !== 'PENDING')
        .slice(-20)
        .map(p => ({
          time: toChartTime(p.timestamp),
          position: (p.direction === 'UP' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
          color: p.outcome === 'WIN' ? '#00ff41' : '#ff4444',
          shape: (p.direction === 'UP' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          text: p.outcome === 'WIN' ? 'W' : 'L',
        }));

      markersRef.current.setMarkers(markerData);
    }
  }, [candles, predictions]);

  return (
    <div className="glass-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-nexzen-muted mb-2 flex items-center justify-between">
        <span>BTCUSDT · 5m CANDLES</span>
        <span className="normal-case text-nexzen-muted/60">via Binance Kline WS + REST</span>
      </div>
      <div ref={containerRef} className="w-full h-[300px] md:h-[400px]" />
    </div>
  );
});
