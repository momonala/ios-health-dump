/**
 * iOS Health Dashboard
 */

const CONFIG = {
    apiEndpoint: '/api/health-data',
    goals: {
        steps: 10000,
        kcals: 500,
        km: 8,
        flights_climbed: 50,
    },
    chartColors: {
        steps: {
            main: '#5AC8FA',
            light: 'rgba(90, 200, 250, 0.2)',
        },
        kcals: {
            main: '#FF9500',
            light: 'rgba(255, 149, 0, 0.2)',
        },
        km: {
            main: '#34C759',
            light: 'rgba(52, 199, 89, 0.2)',
        },
        flights_climbed: {
            main: '#AF52DE',
            light: 'rgba(175, 82, 222, 0.2)',
        },
        weight: {
            main: '#FF6B9D',
            light: 'rgba(255, 107, 157, 0.2)',
        },
    },
    periods: {
        week: 7,
        month: 30,
        year: 365,
        all: Infinity,
    },
};

const state = {
    healthData: [],
    currentPeriod: 'month',
    groupBy: 'day',
    chart: null,
    sort: {
        column: 'date',
        direction: 'desc',
    },
    selection: {
        start: null,
        end: null,
        isSelecting: false,
        startX: null,
    },
};

// ============================================
// Utility Functions
// ============================================

const formatNumber = (num, decimals = 0) => {
    if (num === null || num === undefined || isNaN(num)) return '--';
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

const parseDate = (dateStr) => new Date(dateStr);

const getDateOnly = (dateStr) => parseDate(dateStr).toISOString().split('T')[0];

const formatDate = (dateStr) => {
    const date = parseDate(dateStr);
    return {
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        full: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }),
        compact: (() => {
            const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
            const day = date.getDate();
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            const year = date.getFullYear();
            return `${weekday}. ${day} ${month} ${year}`;
        })(),
        iso: getDateOnly(dateStr),
    };
};

const getTodayISO = () => new Date().toISOString().split('T')[0];

const calcPercentage = (value, goal) => Math.min(100, Math.round((value / goal) * 100));

const filterByPeriod = (data, period) => {
    if (period === 'all') return data;
    const days = CONFIG.periods[period];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return data.filter(item => getDateOnly(item.date) >= cutoffStr);
};

const getMonthKey = (dateStr) => {
    const date = parseDate(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (monthKey, formatMonthYear = false) => {
    const [year, month] = monthKey.split('-');
    if (formatMonthYear) {
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('en-US', { 
        month: 'short', 
        year: '2-digit' 
    });
};

const groupDataByDay = (data) => {
    // Sort by date ascending
    const sorted = [...data].sort((a, b) => getDateOnly(a.date).localeCompare(getDateOnly(b.date)));
    const formatMonthYear = state.currentPeriod === 'all' || state.currentPeriod === 'year';
    
    return {
        labels: sorted.map(d => {
            const date = parseDate(d.date);
            if (formatMonthYear) {
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }),
        steps: sorted.map(d => Number(d.steps) || 0),
        kcals: sorted.map(d => Number(d.kcals) || 0),
        km: sorted.map(d => Number(d.km) || 0),
        flights_climbed: sorted.map(d => Number(d.flights_climbed) || 0),
        weight: sorted.map(d => d.weight ? Number(d.weight) : null),
    };
};

const groupDataByMonth = (data) => {
    const monthMap = {};
    
    data.forEach(item => {
        if (!item.date) return;
        const monthKey = getMonthKey(item.date);
        if (!monthMap[monthKey]) {
            monthMap[monthKey] = { 
                steps: { total: 0, count: 0 },
                kcals: { total: 0, count: 0 },
                km: { total: 0, count: 0 },
                flights_climbed: { total: 0, count: 0 },
                weight: null, // Store latest weight value, not average
            };
        }
        
        const stepsVal = Number(item.steps) || 0;
        const kcalsVal = Number(item.kcals) || 0;
        const kmVal = Number(item.km) || 0;
        const stairsVal = Number(item.flights_climbed) || 0;
        const weightVal = item.weight ? Number(item.weight) : null;
        
        if (stepsVal > 0) {
            monthMap[monthKey].steps.total += stepsVal;
            monthMap[monthKey].steps.count += 1;
        }
        if (kcalsVal > 0) {
            monthMap[monthKey].kcals.total += kcalsVal;
            monthMap[monthKey].kcals.count += 1;
        }
        if (kmVal > 0) {
            monthMap[monthKey].km.total += kmVal;
            monthMap[monthKey].km.count += 1;
        }
        if (stairsVal > 0) {
            monthMap[monthKey].flights_climbed.total += stairsVal;
            monthMap[monthKey].flights_climbed.count += 1;
        }
        // For weight, use the latest value in the period (most recent)
        if (weightVal !== null && weightVal > 0) {
            monthMap[monthKey].weight = weightVal;
        }
    });
    
    const sortedMonths = Object.keys(monthMap).sort();
    
    const formatMonthYear = state.currentPeriod === 'all' || state.currentPeriod === 'year';
    
    return {
        labels: sortedMonths.map(m => getMonthLabel(m, formatMonthYear)),
        steps: sortedMonths.map(m => monthMap[m].steps.count > 0 ? monthMap[m].steps.total / monthMap[m].steps.count : 0),
        kcals: sortedMonths.map(m => monthMap[m].kcals.count > 0 ? monthMap[m].kcals.total / monthMap[m].kcals.count : 0),
        km: sortedMonths.map(m => monthMap[m].km.count > 0 ? monthMap[m].km.total / monthMap[m].km.count : 0),
        flights_climbed: sortedMonths.map(m => monthMap[m].flights_climbed.count > 0 ? monthMap[m].flights_climbed.total / monthMap[m].flights_climbed.count : 0),
        weight: sortedMonths.map(m => monthMap[m].weight), // Use latest weight value, not average
    };
};

const getWeekKey = (dateStr) => {
    const date = parseDate(dateStr);
    // Get the Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    return monday.toISOString().split('T')[0];
};

const getWeekLabel = (weekKey, formatMonthYear = false) => {
    const date = new Date(weekKey);
    if (formatMonthYear) {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const groupDataByWeek = (data) => {
    const weekMap = {};
    
    data.forEach(item => {
        if (!item.date) return;
        const weekKey = getWeekKey(item.date);
        if (!weekMap[weekKey]) {
            weekMap[weekKey] = { 
                steps: { total: 0, count: 0 },
                kcals: { total: 0, count: 0 },
                km: { total: 0, count: 0 },
                flights_climbed: { total: 0, count: 0 },
                weight: null, // Store latest weight value, not average
            };
        }
        
        const stepsVal = Number(item.steps) || 0;
        const kcalsVal = Number(item.kcals) || 0;
        const kmVal = Number(item.km) || 0;
        const stairsVal = Number(item.flights_climbed) || 0;
        const weightVal = item.weight ? Number(item.weight) : null;
        
        if (stepsVal > 0) {
            weekMap[weekKey].steps.total += stepsVal;
            weekMap[weekKey].steps.count += 1;
        }
        if (kcalsVal > 0) {
            weekMap[weekKey].kcals.total += kcalsVal;
            weekMap[weekKey].kcals.count += 1;
        }
        if (kmVal > 0) {
            weekMap[weekKey].km.total += kmVal;
            weekMap[weekKey].km.count += 1;
        }
        if (stairsVal > 0) {
            weekMap[weekKey].flights_climbed.total += stairsVal;
            weekMap[weekKey].flights_climbed.count += 1;
        }
        // For weight, use the latest value in the period (most recent)
        if (weightVal !== null && weightVal > 0) {
            weekMap[weekKey].weight = weightVal;
        }
    });
    
    const sortedWeeks = Object.keys(weekMap).sort();
    const formatMonthYear = state.currentPeriod === 'all' || state.currentPeriod === 'year';
    
    return {
        labels: sortedWeeks.map(w => formatMonthYear ? getWeekLabel(w, true) : `Week of ${getWeekLabel(w)}`),
        steps: sortedWeeks.map(w => weekMap[w].steps.count > 0 ? weekMap[w].steps.total / weekMap[w].steps.count : 0),
        kcals: sortedWeeks.map(w => weekMap[w].kcals.count > 0 ? weekMap[w].kcals.total / weekMap[w].kcals.count : 0),
        km: sortedWeeks.map(w => weekMap[w].km.count > 0 ? weekMap[w].km.total / weekMap[w].km.count : 0),
        flights_climbed: sortedWeeks.map(w => weekMap[w].flights_climbed.count > 0 ? weekMap[w].flights_climbed.total / weekMap[w].flights_climbed.count : 0),
        weight: sortedWeeks.map(w => weekMap[w].weight), // Use latest weight value, not average
    };
};

const getGroupedData = (data, groupBy) => {
    switch (groupBy) {
        case 'day':
            return groupDataByDay(data);
        case 'week':
            return groupDataByWeek(data);
        case 'month':
            return groupDataByMonth(data);
        default:
            return groupDataByDay(data);
    }
};

const calcStats = (data, field) => {
    if (!data.length) return { avg: 0, total: 0, min: 0, max: 0 };
    const values = data.map(d => Number(d[field]) || 0).filter(v => v > 0);
    if (!values.length) return { avg: 0, total: 0, min: 0, max: 0 };
    const total = values.reduce((a, b) => a + b, 0);
    return {
        avg: total / values.length,
        total,
        min: Math.min(...values),
        max: Math.max(...values),
    };
};

const calcAverage = (values) => {
    const valid = values.filter(v => v > 0);
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
};

// ============================================
// DOM Manipulation
// ============================================

const updateText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

const updateProgressRing = (id, percentage, animated = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (animated) {
        // Animate from 0 to target percentage
        el.setAttribute('stroke-dasharray', '0, 100');
        
        // Use requestAnimationFrame for smooth animation
        const duration = 2000;
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // ease-out-expo: smooth, natural deceleration
            const easeOutExpo = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const currentPercentage = easeOutExpo * percentage;
            
            el.setAttribute('stroke-dasharray', `${currentPercentage}, 100`);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    } else {
        el.setAttribute('stroke-dasharray', `${percentage}, 100`);
    }
};

const updateHeaderDate = (data) => {
    if (data && data.length > 0 && data[0].recorded_at) {
        const lastUpdate = new Date(data[0].recorded_at);
        const formatted = `Last Updated: ${lastUpdate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })}`;
        updateText('headerDate', formatted);
    } else {
        updateText('headerDate', 'Last Updated: --');
    }
};

const updateTodayMetrics = (todayData, animated = false) => {
    if (!todayData) {
        todayData = { steps: 0, kcals: 0, km: 0, flights_climbed: 0 };
    }
    
    updateText('todaySteps', formatNumber(todayData.steps));
    updateText('todayKcals', formatNumber(Math.round(todayData.kcals ?? 0)));
    updateText('todayKm', formatNumber(todayData.km, 1));
    updateText('todayFlightsClimbed', formatNumber(todayData.flights_climbed ?? 0));
    
    updateProgressRing('stepsProgress', calcPercentage(todayData.steps ?? 0, CONFIG.goals.steps), animated);
    updateProgressRing('kcalsProgress', calcPercentage(todayData.kcals ?? 0, CONFIG.goals.kcals), animated);
    updateProgressRing('kmProgress', calcPercentage(todayData.km ?? 0, CONFIG.goals.km), animated);
    updateProgressRing('flightsClimbedProgress', calcPercentage(todayData.flights_climbed ?? 0, CONFIG.goals.flights_climbed), animated);
    
    updateText('stepsGoalLabel', `of ${formatNumber(CONFIG.goals.steps)} goal`);
    updateText('kcalsGoalLabel', `of ${formatNumber(CONFIG.goals.kcals)} goal`);
    updateText('kmGoalLabel', `of ${CONFIG.goals.km} km goal`);
    updateText('flightsClimbedGoalLabel', `of ${formatNumber(CONFIG.goals.flights_climbed)} goal`);
};

const updateStatistics = (data, period, selectedRange = null) => {
    let filteredData = filterByPeriod(data, period);
    
    // Apply selection range if provided
    if (selectedRange && selectedRange.start !== null && selectedRange.end !== null) {
        const startDate = getDateOnly(selectedRange.start);
        const endDate = getDateOnly(selectedRange.end);
        filteredData = filteredData.filter(item => {
            const itemDate = getDateOnly(item.date);
            return itemDate >= startDate && itemDate <= endDate;
        });
    }
    
    const stepsStats = calcStats(filteredData, 'steps');
    const kcalsStats = calcStats(filteredData, 'kcals');
    const kmStats = calcStats(filteredData, 'km');
    const stairsStats = calcStats(filteredData, 'flights_climbed');
    const weightStats = calcStats(filteredData, 'weight');
    
    // Update Days Tracked badge in header
    updateText('daysTrackedBadge', `${filteredData.length} days`);
    
    // Update grouped stats cards
    // Steps card
    updateText('stepsMin', formatNumber(Math.round(stepsStats.min)));
    updateText('stepsMax', formatNumber(Math.round(stepsStats.max)));
    updateText('stepsAvg', formatNumber(Math.round(stepsStats.avg)));
    updateText('stepsTotal', formatNumber(Math.round(stepsStats.total)));
    
    // Distance card
    updateText('distanceMin', `${formatNumber(kmStats.min, 1)} km`);
    updateText('distanceMax', `${formatNumber(kmStats.max, 1)} km`);
    updateText('distanceAvg', `${formatNumber(kmStats.avg, 1)} km`);
    updateText('distanceTotal', `${formatNumber(kmStats.total, 1)} km`);
    
    // Flights card
    updateText('flightsMin', formatNumber(Math.round(stairsStats.min)));
    updateText('flightsMax', formatNumber(Math.round(stairsStats.max)));
    updateText('flightsAvg', formatNumber(Math.round(stairsStats.avg)));
    updateText('flightsTotal', formatNumber(Math.round(stairsStats.total)));
    
    // Calories card
    updateText('caloriesMin', formatNumber(Math.round(kcalsStats.min)));
    updateText('caloriesMax', formatNumber(Math.round(kcalsStats.max)));
    updateText('caloriesAvg', formatNumber(Math.round(kcalsStats.avg)));
    updateText('caloriesTotal', formatNumber(Math.round(kcalsStats.total)));
    
    // Weight card - Latest should come from all data, not filtered
    // Find the most recent weight from all data (data is sorted by date DESC)
    const latestWeight = data.find(item => item.weight !== null && item.weight !== undefined)?.weight || null;
    updateText('weightMin', weightStats.min > 0 ? `${formatNumber(weightStats.min, 1)} kg` : '--');
    updateText('weightMax', weightStats.max > 0 ? `${formatNumber(weightStats.max, 1)} kg` : '--');
    updateText('weightAvg', weightStats.avg > 0 ? `${formatNumber(weightStats.avg, 1)} kg` : '--');
    updateText('weightLatest', latestWeight ? `${formatNumber(latestWeight, 1)} kg` : '--');
};

const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

const sortActivityData = (data, column, direction) => {
    const sorted = [...data];
    const multiplier = direction === 'asc' ? 1 : -1;
    
    sorted.sort((a, b) => {
        let aVal, bVal;
        
        switch (column) {
            case 'date':
                aVal = getDateOnly(a.date);
                bVal = getDateOnly(b.date);
                return aVal.localeCompare(bVal) * multiplier;
            case 'steps':
                aVal = Number(a.steps) || 0;
                bVal = Number(b.steps) || 0;
                break;
            case 'kcals':
                aVal = Number(a.kcals) || 0;
                bVal = Number(b.kcals) || 0;
                break;
            case 'km':
                aVal = Number(a.km) || 0;
                bVal = Number(b.km) || 0;
                break;
            case 'flights_climbed':
                aVal = Number(a.flights_climbed) || 0;
                bVal = Number(b.flights_climbed) || 0;
                break;
            case 'weight':
                aVal = Number(a.weight) || 0;
                bVal = Number(b.weight) || 0;
                break;
            default:
                return 0;
        }
        
        return (aVal - bVal) * multiplier;
    });
    
    return sorted;
};

const updateSortIndicators = () => {
    document.querySelectorAll('.activity-th--sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === state.sort.column) {
            th.classList.add(`sort-${state.sort.direction}`);
        }
    });
};

const renderActivityList = (data) => {
    const container = document.getElementById('activityList');
    const resultsInfo = document.getElementById('activityResultsInfo');
    if (!container) return;
    
    // Apply sorting
    const sortedData = sortActivityData(data, state.sort.column, state.sort.direction);
    
    // Update sort indicators
    updateSortIndicators();
    
    if (!data.length) {
        const table = document.getElementById('activityTable');
        const columnCount = table ? table.querySelectorAll('thead th').length : 1;
        container.innerHTML = `
            <tr class="activity-empty-row">
                <td colspan="${columnCount}">
                    <div class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <p class="empty-state-text">No activity data yet</p>
                    </div>
                </td>
            </tr>
        `;
        if (resultsInfo) resultsInfo.textContent = '';
        return;
    }
    
    container.innerHTML = sortedData.map(item => {
        const dateInfo = formatDate(item.date);
        const dateIso = getDateOnly(item.date);
        const stepsStr = formatNumber(item.steps);
        const kcalsStr = formatNumber(Math.round(item.kcals ?? 0));
        const kmStr = formatNumber(item.km, 1);
        const stairsStr = formatNumber(item.flights_climbed ?? 0);
        const weightStr = item.weight ? formatNumber(item.weight, 1) : '--';
        
        return `
            <tr class="activity-tr" data-date="${dateIso}">
                <td class="activity-td activity-td--date">${escapeHtml(dateInfo.compact)}</td>
                <td class="activity-td activity-td--steps">${escapeHtml(stepsStr)}</td>
                <td class="activity-td activity-td--calories">${escapeHtml(kcalsStr)}</td>
                <td class="activity-td activity-td--distance">${escapeHtml(kmStr)} km</td>
                <td class="activity-td activity-td--flights-climbed">${escapeHtml(stairsStr)}</td>
                <td class="activity-td activity-td--weight">${escapeHtml(weightStr)}${item.weight ? ' kg' : ''}</td>
            </tr>
        `;
    }).join('');
    
    if (resultsInfo) {
        resultsInfo.textContent = `${data.length} total entries`;
    }
};

const jumpToDate = (dateStr) => {
    if (!dateStr) return;
    
    const container = document.getElementById('activityTableContainer');
    const row = document.querySelector(`.activity-tr[data-date="${dateStr}"]`);
    
    // Remove any existing highlights
    document.querySelectorAll('.activity-tr.highlight').forEach(r => r.classList.remove('highlight'));
    
    if (row && container) {
        // Get the row's position relative to the table (which is inside the container)
        // row.offsetTop is relative to the table, and the table starts at 0 relative to container
        const rowTop = row.offsetTop;
        const containerHeight = container.clientHeight;
        const rowHeight = row.offsetHeight;
        
        // Calculate scroll position to center the row in the container viewport
        const scrollTop = rowTop - (containerHeight / 2) + (rowHeight / 2);
        
        container.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
        });
        
        // Highlight the row
        row.classList.add('highlight');
    } else if (dateStr) {
        // Date not found - find closest date
        const rows = document.querySelectorAll('.activity-tr[data-date]');
        let closestRow = null;
        let closestDiff = Infinity;
        
        rows.forEach(r => {
            const rowDate = r.dataset.date;
            const diff = Math.abs(new Date(dateStr) - new Date(rowDate));
            if (diff < closestDiff) {
                closestDiff = diff;
                closestRow = r;
            }
        });
        
        if (closestRow && container) {
            // Get the row's position relative to the table
            const rowTop = closestRow.offsetTop;
            const containerHeight = container.clientHeight;
            const rowHeight = closestRow.offsetHeight;
            
            // Calculate scroll position to center the row in the container viewport
            const scrollTop = rowTop - (containerHeight / 2) + (rowHeight / 2);
            
            container.scrollTo({
                top: Math.max(0, scrollTop),
                behavior: 'smooth'
            });
            
            closestRow.classList.add('highlight');
        }
    }
};

const updateLastSync = (data) => {
    if (data.length && data[0].recorded_at) {
        const syncTime = new Date(data[0].recorded_at);
        updateText('lastSync', syncTime.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }));
    }
};

// ============================================
// Combined Chart with Multi Y-Axis
// ============================================

const getCombinedChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        intersect: false,
        mode: 'index',
    },
    plugins: {
        legend: {
            display: true,
            position: 'top',
            labels: {
                color: 'rgba(255, 255, 255, 0.8)',
                font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 12 },
                usePointStyle: true,
                pointStyle: 'circle',
                padding: 20,
                filter: (legendItem) => !legendItem.text.includes('Avg'),
            },
        },
        tooltip: {
            backgroundColor: 'rgba(28, 28, 30, 0.95)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: true,
            titleFont: {
                family: '-apple-system, BlinkMacSystemFont, sans-serif',
                size: 13,
                weight: 600,
            },
            bodyFont: {
                family: '-apple-system, BlinkMacSystemFont, sans-serif',
                size: 13,
                weight: 500,
            },
            filter: (tooltipItem) => {
                // Hide average lines from tooltip
                return !tooltipItem.dataset.label.includes('Avg');
            },
            callbacks: {
                label: (context) => {
                    const value = context.raw;
                    const label = context.dataset.label;
                    if (label.includes('Steps')) return `Steps: ${formatNumber(value)}`;
                    if (label.includes('Calories')) return `Calories: ${formatNumber(Math.round(value))} kcal`;
                    if (label.includes('Distance')) return `Distance: ${formatNumber(value, 1)} km`;
                    if (label.includes('Flights Climbed')) return `Flights Climbed: ${formatNumber(value)}`;
                    if (label.includes('Weight')) return `Weight: ${formatNumber(value, 1)} kg`;
                    return `${label}: ${formatNumber(value)}`;
                },
            },
        },
    },
    scales: {
        x: {
            type: 'category',
            grid: { display: false },
            ticks: {
                color: 'rgba(255, 255, 255, 0.4)',
                font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 11 },
                maxRotation: 45,
                autoSkip: true,
                maxTicksLimit: 15,
            },
            border: { display: false },
        },
        ySteps: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
                color: CONFIG.chartColors.steps.main,
                font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 10 },
                callback: (value) => value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value,
            },
            border: { display: false },
            title: {
                display: true,
                text: 'Steps',
                color: CONFIG.chartColors.steps.main,
                font: { size: 11 },
            },
        },
        yKcals: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: {
                color: CONFIG.chartColors.kcals.main,
                font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 10 },
            },
            border: { display: false },
            title: {
                display: true,
                text: 'Calories',
                color: CONFIG.chartColors.kcals.main,
                font: { size: 11 },
            },
        },
        yKm: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: {
                color: CONFIG.chartColors.km.main,
                font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 10 },
            },
            border: { display: false },
            title: {
                display: true,
                text: 'Distance (km)',
                color: CONFIG.chartColors.km.main,
                font: { size: 11 },
            },
        },
        yFlightsClimbed: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: {
                color: CONFIG.chartColors.flights_climbed.main,
                font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 10 },
            },
            border: { display: false },
            title: {
                display: true,
                text: 'Flights Climbed',
                color: CONFIG.chartColors.flights_climbed.main,
                font: { size: 11 },
            },
        },
        yWeight: {
            type: 'linear',
            position: 'right',
            beginAtZero: false,
            grid: { display: false },
            ticks: {
                color: CONFIG.chartColors.weight.main,
                font: { family: '-apple-system, BlinkMacSystemFont, sans-serif', size: 10 },
            },
            border: { display: false },
            title: {
                display: true,
                text: 'Weight (kg)',
                color: CONFIG.chartColors.weight.main,
                font: { size: 11 },
            },
        },
    },
    elements: {
        point: {
            radius: 2,
            hoverRadius: 5,
            hoverBorderWidth: 2,
            hoverBorderColor: '#fff',
        },
        line: {
            tension: 0.2,
            borderWidth: 2,
            spanGaps: true, // Connect lines across missing data points
        },
    },
});

const updateCombinedChart = (data) => {
    const canvas = document.getElementById('combinedChart');
    if (!canvas) {
        console.error('Canvas not found: combinedChart');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const filteredData = filterByPeriod(data, state.currentPeriod);
    
    if (!filteredData.length) {
        console.warn('No data for combined chart');
        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }
        return;
    }
    
    // Group data based on user selection
    const grouped = getGroupedData(filteredData, state.groupBy);
    
    // Calculate averages
    const stepsAvg = calcAverage(grouped.steps);
    const kcalsAvg = calcAverage(grouped.kcals);
    const kmAvg = calcAverage(grouped.km);
    const stairsAvg = calcAverage(grouped.flights_climbed);
    
    const chartData = {
        labels: grouped.labels,
        datasets: [
            {
                label: 'Steps',
                data: grouped.steps,
                borderColor: CONFIG.chartColors.steps.main,
                backgroundColor: CONFIG.chartColors.steps.light,
                yAxisID: 'ySteps',
                fill: false,
            },
            {
                label: 'Steps Avg',
                data: Array(grouped.labels.length).fill(stepsAvg),
                borderColor: CONFIG.chartColors.steps.main,
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                yAxisID: 'ySteps',
                fill: false,
            },
            {
                label: 'Calories',
                data: grouped.kcals,
                borderColor: CONFIG.chartColors.kcals.main,
                backgroundColor: CONFIG.chartColors.kcals.light,
                yAxisID: 'yKcals',
                fill: false,
            },
            {
                label: 'Calories Avg',
                data: Array(grouped.labels.length).fill(kcalsAvg),
                borderColor: CONFIG.chartColors.kcals.main,
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                yAxisID: 'yKcals',
                fill: false,
            },
            {
                label: 'Distance',
                data: grouped.km,
                borderColor: CONFIG.chartColors.km.main,
                backgroundColor: CONFIG.chartColors.km.light,
                yAxisID: 'yKm',
                fill: false,
            },
            {
                label: 'Distance Avg',
                data: Array(grouped.labels.length).fill(kmAvg),
                borderColor: CONFIG.chartColors.km.main,
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                yAxisID: 'yKm',
                fill: false,
            },
            {
                label: 'Flights Climbed',
                data: grouped.flights_climbed,
                borderColor: CONFIG.chartColors.flights_climbed.main,
                backgroundColor: CONFIG.chartColors.flights_climbed.light,
                yAxisID: 'yFlightsClimbed',
                fill: false,
            },
            {
                label: 'Flights Climbed Avg',
                data: Array(grouped.labels.length).fill(stairsAvg),
                borderColor: CONFIG.chartColors.flights_climbed.main,
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                yAxisID: 'yFlightsClimbed',
                fill: false,
            },
            {
                label: 'Weight',
                data: grouped.weight,
                borderColor: CONFIG.chartColors.weight.main,
                backgroundColor: CONFIG.chartColors.weight.light,
                yAxisID: 'yWeight',
                fill: false,
                spanGaps: true, // Connect across null/missing values
            },
        ],
    };
    
    if (state.chart) {
        state.chart.destroy();
    }
    
    // Clean up existing overlay
    const existingOverlay = document.getElementById('chartSelectionOverlay');
    if (existingOverlay) existingOverlay.remove();
    
    console.log(`Creating combined chart with ${grouped.labels.length} data points (period: ${state.currentPeriod}, groupBy: ${state.groupBy})`);
    
    state.chart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: getCombinedChartOptions(),
    });
    
    // Setup drag selection
    setupChartDragSelection(canvas, filteredData, grouped);
};

// ============================================
// Chart Drag Selection
// ============================================

const setupChartDragSelection = (canvas, filteredData, grouped) => {
    let isDragging = false;
    let startX = null;
    let selectionOverlay = null;
    
    // Create overlay canvas for selection rectangle
    const createOverlay = () => {
        // Remove existing overlay if present
        const existing = document.getElementById('chartSelectionOverlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('canvas');
        overlay.id = 'chartSelectionOverlay';
        overlay.style.position = 'absolute';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '10';
        
        const rect = canvas.getBoundingClientRect();
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        
        overlay.style.top = (rect.top - containerRect.top) + 'px';
        overlay.style.left = (rect.left - containerRect.left) + 'px';
        
        // Match canvas dimensions accounting for devicePixelRatio
        const dpr = window.devicePixelRatio || 1;
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        container.appendChild(overlay);
        return overlay;
    };
    
    const getChartPosition = (e) => {
        if (!state.chart) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        return { x, y };
    };
    
    const getDataIndexFromX = (x) => {
        if (!state.chart) return null;
        const chartArea = state.chart.chartArea;
        const scale = state.chart.scales.x;
        const value = scale.getValueForPixel(x);
        const index = Math.round(value);
        return Math.max(0, Math.min(index, grouped.labels.length - 1));
    };
    
    const drawSelection = (startX, currentX) => {
        if (!selectionOverlay || !state.chart) {
            if (!selectionOverlay) {
                selectionOverlay = createOverlay();
            }
            return;
        }
        const ctx = selectionOverlay.getContext('2d');
        const chartArea = state.chart.chartArea;
        
        ctx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height);
        
        const left = Math.min(startX, currentX);
        const right = Math.max(startX, currentX);
        const width = right - left;
        
        // Ensure coordinates are within chart area
        const drawLeft = Math.max(chartArea.left, Math.min(left, chartArea.right));
        const drawRight = Math.max(chartArea.left, Math.min(right, chartArea.right));
        const drawWidth = drawRight - drawLeft;
        
        if (drawWidth > 0) {
            ctx.fillStyle = 'rgba(90, 200, 250, 0.2)';
            ctx.fillRect(drawLeft, chartArea.top, drawWidth, chartArea.bottom - chartArea.top);
            
            ctx.strokeStyle = 'rgba(90, 200, 250, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(drawLeft, chartArea.top, drawWidth, chartArea.bottom - chartArea.top);
        }
    };
    
    const clearSelection = () => {
        if (selectionOverlay) {
            const ctx = selectionOverlay.getContext('2d');
            ctx.clearRect(0, 0, selectionOverlay.width, selectionOverlay.height);
        }
        state.selection.start = null;
        state.selection.end = null;
        updateStatistics(state.healthData, state.currentPeriod, state.selection);
    };
    
    const applySelection = (startX, endX) => {
        const startIdx = getDataIndexFromX(startX);
        const endIdx = getDataIndexFromX(endX);
        
        if (startIdx === null || endIdx === null) return;
        
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        
        // Get dates from grouped data - map indices back to actual dates
        const sortedData = [...filteredData].sort((a, b) => getDateOnly(a.date).localeCompare(getDateOnly(b.date)));
        
        if (sortedData.length === 0) return;
        
        // Map grouped indices to actual data dates
        let startDate, endDate;
        
        if (state.groupBy === 'day') {
            // For day grouping, each label corresponds to a day
            // Map grouped index to sorted data index
            const ratio = sortedData.length / grouped.labels.length;
            const startDataIdx = Math.floor(minIdx * ratio);
            const endDataIdx = Math.ceil((maxIdx + 1) * ratio) - 1;
            startDate = sortedData[Math.max(0, startDataIdx)]?.date;
            endDate = sortedData[Math.min(sortedData.length - 1, endDataIdx)]?.date;
        } else if (state.groupBy === 'week') {
            // For week grouping, map to week boundaries
            const ratio = sortedData.length / grouped.labels.length;
            const startDataIdx = Math.floor(minIdx * ratio);
            const endDataIdx = Math.ceil((maxIdx + 1) * ratio) - 1;
            startDate = sortedData[Math.max(0, startDataIdx)]?.date;
            endDate = sortedData[Math.min(sortedData.length - 1, endDataIdx)]?.date;
        } else {
            // For month grouping
            const ratio = sortedData.length / grouped.labels.length;
            const startDataIdx = Math.floor(minIdx * ratio);
            const endDataIdx = Math.ceil((maxIdx + 1) * ratio) - 1;
            startDate = sortedData[Math.max(0, startDataIdx)]?.date;
            endDate = sortedData[Math.min(sortedData.length - 1, endDataIdx)]?.date;
        }
        
        if (startDate && endDate) {
            state.selection.start = startDate;
            state.selection.end = endDate;
            updateStatistics(state.healthData, state.currentPeriod, state.selection);
        }
    };
    
    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left mouse button
        const pos = getChartPosition(e);
        if (state.chart && pos.x >= state.chart.chartArea.left && pos.x <= state.chart.chartArea.right) {
            isDragging = true;
            startX = pos.x;
            canvas.style.cursor = 'crosshair';
            if (!selectionOverlay) {
                selectionOverlay = createOverlay();
            }
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (isDragging && startX !== null) {
            const pos = getChartPosition(e);
            drawSelection(startX, pos.x);
        } else {
            canvas.style.cursor = 'default';
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (isDragging && startX !== null) {
            const pos = getChartPosition(e);
            applySelection(startX, pos.x);
            isDragging = false;
            startX = null;
            canvas.style.cursor = 'default';
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            startX = null;
            canvas.style.cursor = 'default';
        }
    });
    
    // Double-click to clear selection
    canvas.addEventListener('dblclick', () => {
        clearSelection();
    });
};

// ============================================
// Event Handlers
// ============================================

const getAvailableGroupByOptions = (period) => {
    switch (period) {
        case 'week':
            return ['day'];
        case 'month':
            return ['day', 'week'];
        case 'year':
        case 'all':
        default:
            return ['day', 'week', 'month'];
    }
};

const updateGroupByOptions = (period) => {
    const select = document.getElementById('groupBySelect');
    if (!select) return;
    
    const availableOptions = getAvailableGroupByOptions(period);
    
    // Update option visibility/disabled state
    Array.from(select.options).forEach(option => {
        const isAvailable = availableOptions.includes(option.value);
        option.disabled = !isAvailable;
        option.style.display = isAvailable ? '' : 'none';
    });
    
    // If current selection is not available, select the best available option
    if (!availableOptions.includes(state.groupBy)) {
        // For week period, use day; for month, prefer week; otherwise month
        if (period === 'week') {
            state.groupBy = 'day';
        } else if (period === 'month') {
            state.groupBy = 'week';
        } else {
            state.groupBy = 'month';
        }
        select.value = state.groupBy;
    }
};

const handlePeriodChange = (event) => {
    const btn = event.target.closest('.period-btn');
    if (!btn) return;
    
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    state.currentPeriod = btn.dataset.period;
    
    // Clear selection when period changes
    state.selection.start = null;
    state.selection.end = null;
    const overlay = document.getElementById('chartSelectionOverlay');
    if (overlay) overlay.remove();
    
    // Update groupBy options based on new period
    updateGroupByOptions(state.currentPeriod);
    
    updateStatistics(state.healthData, state.currentPeriod, state.selection);
    updateCombinedChart(state.healthData);
};

const handleGroupByChange = (event) => {
    state.groupBy = event.target.value;
    
    // Clear selection when groupBy changes
    state.selection.start = null;
    state.selection.end = null;
    const overlay = document.getElementById('chartSelectionOverlay');
    if (overlay) overlay.remove();
    
    updateStatistics(state.healthData, state.currentPeriod, state.selection);
    updateCombinedChart(state.healthData);
};

const handleDateJump = (event) => {
    jumpToDate(event.target.value);
};

const handleSortClick = (event) => {
    const th = event.target.closest('.activity-th--sortable');
    if (!th) return;
    
    const column = th.dataset.sort;
    
    if (state.sort.column === column) {
        // Toggle direction
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to descending for metrics, ascending for date
        state.sort.column = column;
        state.sort.direction = column === 'date' ? 'desc' : 'desc';
    }
    
    renderActivityList(state.healthData);
    
    // Scroll to top of the table container
    const container = document.getElementById('activityTableContainer');
    if (container) {
        container.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
};

const initEventListeners = () => {
    const periodSelector = document.querySelector('.period-selector');
    if (periodSelector) {
        periodSelector.addEventListener('click', handlePeriodChange);
    }
    
    const groupBySelect = document.getElementById('groupBySelect');
    if (groupBySelect) {
        groupBySelect.addEventListener('change', handleGroupByChange);
    }
    
    const dateJump = document.getElementById('dateJump');
    if (dateJump) {
        dateJump.addEventListener('change', handleDateJump);
    }
    
    const tableHead = document.querySelector('.activity-table thead');
    if (tableHead) {
        tableHead.addEventListener('click', handleSortClick);
    }
};

// ============================================
// Data Fetching & Init
// ============================================

const fetchTodayData = async () => {
    const response = await fetch(`${CONFIG.apiEndpoint}?date=today`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const json = await response.json();
    return json.data.length > 0 ? json.data[0] : null;
};

const fetchAllHealthData = async () => {
    const response = await fetch(CONFIG.apiEndpoint);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const json = await response.json();
    return json.data || [];
};

const initDashboard = async () => {
    initEventListeners();
    
    // Initialize groupBy options based on default period
    updateGroupByOptions(state.currentPeriod);
    
    // Fetch today's data first (fast) and historical data in parallel (slower)
    const [todayData, allHealthData] = await Promise.all([
        fetchTodayData(),
        fetchAllHealthData(),
    ]);
    
    console.log('Loaded today data:', todayData);
    console.log('Loaded all health data:', allHealthData.length, 'records');
    
    // Update state
    state.healthData = allHealthData;
    
    // Update header with last updated timestamp (data is sorted by date desc, so first item is most recent)
    updateHeaderDate(allHealthData);
    
    // Update today metrics immediately with animation
    updateTodayMetrics(todayData, true);
    
    // Update other sections with historical data
    updateStatistics(state.healthData, state.currentPeriod, state.selection);
    updateCombinedChart(state.healthData);
    renderActivityList(state.healthData);
    updateLastSync(state.healthData);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}
