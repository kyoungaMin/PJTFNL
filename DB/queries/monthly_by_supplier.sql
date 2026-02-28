SELECT
    TO_CHAR(po.po_date, 'YYYY-MM')                                          AS year_month,
    po.cd_partner                                                            AS supplier_code,
    s.customer_name,
    s.country,
    COUNT(*)                                                                 AS total_orders,
    COUNT(*) FILTER (WHERE po.status = 'F')                                 AS completed_orders,
    COUNT(*) FILTER (WHERE po.status = 'P')                                 AS pending_orders,
    COUNT(*) FILTER (WHERE po.status = 'C')                                 AS cancelled_orders,
    COUNT(*) FILTER (WHERE po.status = 'R')                                 AS returned_orders,
    COUNT(DISTINCT po.component_product_id)                                 AS product_count,
    SUM(po.po_qty)                                                          AS total_qty,
    ROUND(SUM(po.po_qty * po.unit_price), 0)                                AS total_amount_krw,
    ROUND(AVG(po.receipt_date - po.po_date), 1)                             AS avg_lead_time_days
FROM purchase_order po
LEFT JOIN supplier s ON s.customer_code = po.cd_partner
GROUP BY year_month, po.cd_partner, s.customer_name, s.country
ORDER BY year_month DESC, total_amount_krw DESC NULLS LAST;
