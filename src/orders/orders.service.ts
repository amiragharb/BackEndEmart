// src/orders/orders.service.ts
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Bit, ConnectionPool, Int, NVarChar } from 'mssql';
import * as mssql from 'mssql';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressDto } from './entities/AddressDto.dto';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject('MSSQL_SETTINGS_CONNECTION')
    private readonly db: ConnectionPool,
  ) {}

  /** Log compact et lisible */
  private compact(dto: Partial<CreateAddressDto | UpdateAddressDto>) {
    const {
      title,
      address,
      lat,
      lng,
      countryName,
      governorateName,
      districtId,
      isHome,
      isWork,
    } = dto ?? {};
    return { title, address, lat, lng, countryName, governorateName, districtId, isHome, isWork };
  }

  // ==================== CREATE ====================
  async addAddress(userId: number, dto: CreateAddressDto): Promise<AddressDto> {
    const started = Date.now();
    this.logger.log(`[addAddress] user=${userId} dto=${JSON.stringify(this.compact(dto))}`);

    try {
      // Si on passe isHome=true → unset les autres "home"
      if (dto.isHome === true) {
        const rUnset = await this.db
          .request()
          .input('UserId', Int, userId)
          .query(`
            UPDATE dbo.tbl_UserLocations
              SET IsHome = 0, ModifiedUserID = @UserId, LastDateModified = GETDATE()
            WHERE UserID = @UserId AND IsHome = 1
              AND (IsDeleted = 0 OR IsDeleted IS NULL);
          `);
        this.logger.debug(`[addAddress] unset previous home rowsAffected=${rUnset.rowsAffected?.[0] ?? 0}`);
      }

      // La BDD stocke Latitude/Longitude en NVARCHAR
      const latStr = dto.lat != null ? String(dto.lat) : null;
      const lngStr = dto.lng != null ? String(dto.lng) : null;

      const countryName = (dto.countryName ?? '').trim() || null;
      const govName     = (dto.governorateName ?? '').trim() || null;

      const req = this.db.request();
      req.input('UserId', Int, userId);
      req.input('Address', NVarChar(1000), dto.address ?? null);
      req.input('Longitude', NVarChar(50), lngStr);
      req.input('Latitude', NVarChar(50), latStr);
      req.input('StreetNameOrNumber', NVarChar(200), dto.streetNameOrNumber ?? null);
      req.input('BuildingNameOrNumber', NVarChar(200), dto.buildingNameOrNumber ?? null);
      req.input('FloorNumber', NVarChar(50), dto.floorNumber ?? null);
      req.input('Apartment', NVarChar(50), dto.apartment ?? null);
      req.input('NearestLandmark', NVarChar(200), dto.nearestLandmark ?? null);
      req.input('IsHome', Bit, dto.isHome ? 1 : 0);
      req.input('IsWork', Bit, dto.isWork ? 1 : 0);
      req.input('CreatorUserID', Int, userId);
      req.input('ModifiedUserID', Int, userId);
      req.input('DistrictID', Int, dto.districtId ?? null);
      req.input('CountryName', NVarChar(200), countryName);      // ✅ string
      req.input('GovernorateName', NVarChar(200), govName);      // ✅ string
      req.input('LabelName', NVarChar(200), dto.title ?? null);

      const insertSql = `
        INSERT INTO dbo.tbl_UserLocations
        ( Address, Longitude, Latitude, UserID,
          StreetNameOrNumber, BuildingNameOrNumber, FloorNumber, Apartment, NearestLandmark,
          IsHome, IsWork,
          CreatorUserID, CreationDate,
          ModifiedUserID, LastDateModified,
          IsDeleted, CountryName, DistrictID, GovernorateName, LabelName )
        OUTPUT INSERTED.UserLocationID AS userLocationId
        VALUES
        ( @Address, @Longitude, @Latitude, @UserId,
          @StreetNameOrNumber, @BuildingNameOrNumber, @FloorNumber, @Apartment, @NearestLandmark,
          @IsHome, @IsWork,
          @CreatorUserID, GETDATE(),
          @ModifiedUserID, GETDATE(),
          0, @CountryName, @DistrictID, @GovernorateName, @LabelName );
      `;

      const rInsert = await req.query(insertSql);
      const id: number | undefined = rInsert.recordset?.[0]?.userLocationId;
      this.logger.debug(
        `[addAddress] insert rowsAffected=${rInsert.rowsAffected?.[0] ?? 0} id=${id} took=${Date.now() - started}ms`,
      );

      if (!id) throw new InternalServerErrorException('Insert failed (no id)');

      const row = await this.findOneForUser(userId, id);
      this.logger.log(`[addAddress] OK user=${userId} id=${id} totalTime=${Date.now() - started}ms`);
      return row;
    } catch (err: any) {
      const info = {
        code: err?.code,
        number: err?.number,
        state: err?.state,
        class: err?.class,
        lineNumber: err?.lineNumber,
        serverName: err?.serverName,
        message: err?.message,
      };
      this.logger.error(`[addAddress] FAILED user=${userId} err=${JSON.stringify(info)}`);
      throw err instanceof InternalServerErrorException
        ? err
        : new InternalServerErrorException('Failed to add address');
    }
  }

  // ==================== READ ONE ====================
  async findOneForUser(userId: number, userLocationId: number): Promise<AddressDto> {
    const t0 = Date.now();
    this.logger.debug(`[findOneForUser] user=${userId} id=${userLocationId}`);

    const sql = `
      SELECT
        ul.UserLocationID                AS userLocationId,
        ul.UserID                        AS userId,
        ul.LabelName                     AS title,
        ul.Address                       AS address,

        ul.StreetNameOrNumber            AS streetNameOrNumber,
        ul.BuildingNameOrNumber          AS buildingNameOrNumber,
        ul.FloorNumber                   AS floorNumber,
        ul.Apartment                     AS apartment,
        ul.NearestLandmark               AS nearestLandmark,

        CASE WHEN ISNUMERIC(REPLACE(ul.Latitude,  ',', '.')) = 1
             THEN CAST(REPLACE(ul.Latitude,  ',', '.') AS float) ELSE NULL END AS lat,
        CASE WHEN ISNUMERIC(REPLACE(ul.Longitude, ',', '.')) = 1
             THEN CAST(REPLACE(ul.Longitude, ',', '.') AS float) ELSE NULL END AS lng,

        NULL                             AS countryId,        -- id obsolète
        ul.CountryName                   AS countryName,      -- ✅ string

        NULL                             AS governorateId,    -- id obsolète
        ul.GovernorateName               AS governorateName,  -- ✅ string

        ul.DistrictID                    AS districtId,
        COALESCE(d.NameEn, d.NameAr)     AS districtName,

        ul.IsHome                        AS isHome,
        ul.IsWork                        AS isWork,
        ul.IsDeleted                     AS isDeleted,
        ul.CreationDate                  AS createdAt,
        ul.LastDateModified              AS updatedAt
      FROM dbo.tbl_UserLocations ul
      LEFT JOIN dbo.lkp_Districts d ON d.DistrictID = ul.DistrictID
      WHERE ul.UserID = @UserId
        AND ul.UserLocationID = @Id
        AND (ul.IsDeleted = 0 OR ul.IsDeleted IS NULL);
    `;

    try {
      const req = this.db.request();
      req.input('UserId', Int, userId);
      req.input('Id', Int, userLocationId);
      const { recordset } = await req.query(sql);
      this.logger.debug(`[findOneForUser] rows=${recordset?.length ?? 0} took=${Date.now() - t0}ms`);
      return recordset?.[0] as AddressDto;
    } catch (err: any) {
      this.logger.error(`[findOneForUser] FAILED user=${userId} id=${userLocationId} err=${err?.message}`);
      throw new InternalServerErrorException('Failed to read address');
    }
  }

  // ==================== READ MANY ====================
  async findByUser(userId: number): Promise<AddressDto[]> {
    const t0 = Date.now();
    this.logger.debug(`[findByUser] user=${userId}`);

    const sql = `
      SELECT
        ul.UserLocationID                AS userLocationId,
        ul.UserID                        AS userId,
        ul.LabelName                     AS title,
        ul.Address                       AS address,

        ul.StreetNameOrNumber            AS streetNameOrNumber,
        ul.BuildingNameOrNumber          AS buildingNameOrNumber,
        ul.FloorNumber                   AS floorNumber,
        ul.Apartment                     AS apartment,
        ul.NearestLandmark               AS nearestLandmark,

        CASE WHEN ISNUMERIC(REPLACE(ul.Latitude,  ',', '.')) = 1
             THEN CAST(REPLACE(ul.Latitude,  ',', '.') AS float) ELSE NULL END AS lat,
        CASE WHEN ISNUMERIC(REPLACE(ul.Longitude, ',', '.')) = 1
             THEN CAST(REPLACE(ul.Longitude, ',', '.') AS float) ELSE NULL END AS lng,

        NULL                             AS countryId,
        ul.CountryName                   AS countryName,      -- ✅

        NULL                             AS governorateId,
        ul.GovernorateName               AS governorateName,  -- ✅

        ul.DistrictID                    AS districtId,
        COALESCE(d.NameEn, d.NameAr)     AS districtName,

        ul.IsHome                        AS isHome,
        ul.IsWork                        AS isWork,
        ul.IsDeleted                     AS isDeleted,
        ul.CreationDate                  AS createdAt,
        ul.LastDateModified              AS updatedAt
      FROM dbo.tbl_UserLocations ul
      LEFT JOIN dbo.lkp_Districts d ON d.DistrictID = ul.DistrictID
      WHERE ul.UserID = @UserId
        AND (ul.IsDeleted = 0 OR ul.IsDeleted IS NULL)
      ORDER BY ul.IsHome DESC, ul.IsWork DESC, ul.UserLocationID DESC;
    `;

    try {
      const req = this.db.request();
      req.input('UserId', Int, userId);
      const { recordset, rowsAffected } = await req.query(sql);
      this.logger.log(
        `[findByUser] user=${userId} rows=${recordset?.length ?? 0} rowsAffected=${rowsAffected?.[0] ?? 0} took=${Date.now() - t0}ms`,
      );
      return recordset as AddressDto[];
    } catch (err: any) {
      const info = {
        code: err?.code,
        number: err?.number,
        state: err?.state,
        class: err?.class,
        message: err?.message,
      };
      this.logger.error(`[findByUser] FAILED user=${userId} err=${JSON.stringify(info)}`);
      throw new InternalServerErrorException('Failed to load user addresses');
    }
  }

  // ==================== UPDATE ====================
  async updateAddress(
    userId: number,
    userLocationId: number,
    dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    const started = Date.now();
    this.logger.log(`[updateAddress] user=${userId} id=${userLocationId} dto=${JSON.stringify(this.compact(dto))}`);

    try {
      // Exclusivité du "home"
      if (dto.isHome === true) {
        await this.db
          .request()
          .input('UserId', Int, userId)
          .input('CurId', Int, userLocationId)
          .query(`
            UPDATE dbo.tbl_UserLocations
              SET IsHome = 0, ModifiedUserID = @UserId, LastDateModified = GETDATE()
            WHERE UserID = @UserId AND IsHome = 1 AND UserLocationID <> @CurId
              AND (IsDeleted = 0 OR IsDeleted IS NULL);
          `);
      }

      const req = this.db.request();
      const latStr = dto.lat == null ? null : String(dto.lat);
      const lngStr = dto.lng == null ? null : String(dto.lng);

      req.input('UserId', Int, userId);
      req.input('Id', Int, userLocationId);
      req.input('Address', NVarChar(1000), dto.address ?? null);
      req.input('Longitude', NVarChar(50), lngStr);
      req.input('Latitude', NVarChar(50), latStr);
      req.input('StreetNameOrNumber', NVarChar(200), dto.streetNameOrNumber ?? null);
      req.input('BuildingNameOrNumber', NVarChar(200), dto.buildingNameOrNumber ?? null);
      req.input('FloorNumber', NVarChar(50), dto.floorNumber ?? null);
      req.input('Apartment', NVarChar(50), dto.apartment ?? null);
      req.input('NearestLandmark', NVarChar(200), dto.nearestLandmark ?? null);
      req.input('IsHome', Bit, dto.isHome == null ? null : dto.isHome ? 1 : 0);
      req.input('IsWork', Bit, dto.isWork == null ? null : dto.isWork ? 1 : 0);
      req.input('CountryName', NVarChar(200), (dto.countryName ?? '').trim() || null);       // ✅
      req.input('DistrictID', Int, dto.districtId ?? null);
      req.input('GovernorateName', NVarChar(200), (dto.governorateName ?? '').trim() || null); // ✅
      req.input('LabelName', NVarChar(200), dto.title ?? null);

      const sql = `
        UPDATE dbo.tbl_UserLocations
        SET
          Address               = COALESCE(@Address, Address),
          Longitude             = COALESCE(@Longitude, Longitude),
          Latitude              = COALESCE(@Latitude, Latitude),
          StreetNameOrNumber    = COALESCE(@StreetNameOrNumber, StreetNameOrNumber),
          BuildingNameOrNumber  = COALESCE(@BuildingNameOrNumber, BuildingNameOrNumber),
          FloorNumber           = COALESCE(@FloorNumber, FloorNumber),
          Apartment             = COALESCE(@Apartment, Apartment),
          NearestLandmark       = COALESCE(@NearestLandmark, NearestLandmark),
          IsHome                = COALESCE(@IsHome, IsHome),
          IsWork                = COALESCE(@IsWork, IsWork),
          CountryName           = COALESCE(@CountryName, CountryName),      -- ✅ string
          DistrictID            = COALESCE(@DistrictID, DistrictID),
          GovernorateName       = COALESCE(@GovernorateName, GovernorateName), -- ✅ string
          LabelName             = COALESCE(@LabelName, LabelName),
          ModifiedUserID        = @UserId,
          LastDateModified      = GETDATE()
        WHERE UserLocationID = @Id
          AND UserID = @UserId
          AND (IsDeleted = 0 OR IsDeleted IS NULL);
      `;

      const r = await req.query(sql);
      if ((r.rowsAffected?.[0] ?? 0) === 0) {
        throw new InternalServerErrorException('Nothing updated');
      }

      const row = await this.findOneForUser(userId, userLocationId);
      this.logger.log(`[updateAddress] OK user=${userId} id=${userLocationId} time=${Date.now() - started}ms`);
      return row;
    } catch (err: any) {
      this.logger.error(`[updateAddress] FAILED user=${userId} id=${userLocationId} err=${err?.message}`);
      throw new InternalServerErrorException('Failed to update address');
    }
  }

  // ==================== DELETE (soft) ====================
  async deleteAddress(userId: number, userLocationId: number): Promise<void> {
    const t0 = Date.now();
    this.logger.log(`[deleteAddress] user=${userId} id=${userLocationId}`);

    const sql = `
      UPDATE dbo.tbl_UserLocations
      SET IsDeleted = 1, ModifiedUserID = @UserId, LastDateModified = GETDATE()
      WHERE UserLocationID = @Id AND UserID = @UserId
        AND (IsDeleted = 0 OR IsDeleted IS NULL);
    `;
    try {
      const req = this.db.request();
      req.input('UserId', Int, userId);
      req.input('Id', Int, userLocationId);
      const r = await req.query(sql);
      if ((r.rowsAffected?.[0] ?? 0) === 0) {
        throw new InternalServerErrorException('Nothing deleted');
      }
      this.logger.log(`[deleteAddress] OK user=${userId} id=${userLocationId} time=${Date.now() - t0}ms`);
    } catch (err: any) {
      this.logger.error(`[deleteAddress] FAILED user=${userId} id=${userLocationId} err=${err?.message}`);
      throw new InternalServerErrorException('Failed to delete address');
    }
  }
   private makeOrderNumber(now = new Date()) {
    const d = now.toISOString().slice(0,10).replace(/-/g,'');
    return `ORD-${d}-${Date.now().toString().slice(-7)}`;
  }

  async create(dto: CreateOrderDto) {
    const tx = new mssql.Transaction(this.db);     // ✅ use mssql.Transaction
    this.logger.log(`[create] start user=${dto.userId} items=${dto.items?.length ?? 0}`);

    if (!dto.items || dto.items.length === 0) {
      this.logger.warn('[create] refuse: no items');
      throw new InternalServerErrorException('Order must contain at least one item');
    }

    try {
      await tx.begin();
      const orderNumber = this.makeOrderNumber();
      const now = new Date();

      this.logger.debug(`[create] inserting tbl_Orders number=${orderNumber}`);

      // --- 1) INSERT into tbl_Orders (NO bare OUTPUT; use OUTPUT INTO) ---
      const req1 = new mssql.Request(tx);
      req1.input('OrderNumber', mssql.NVarChar(mssql.MAX), orderNumber);
      req1.input('OrderDate', mssql.DateTime, now);
      req1.input('UserID', mssql.Int, dto.userId);
      req1.input('AdditionalNotes', mssql.NVarChar(mssql.MAX), dto.additionalNotes ?? null);
      req1.input('ContainFormula', mssql.Bit, 0);
      req1.input('UserLocationID', mssql.Int, dto.userLocationId);
      req1.input('TotalOrderWithoutDeliveryFees', mssql.Numeric(18, 2), dto.total ?? 0);
      req1.input('DeliveryFees', mssql.Numeric(18, 2), dto.deliveryFees ?? 0);
      req1.input('TotalOrder', mssql.Numeric(18, 2), dto.total ?? 0);
      req1.input('DeliveryStartTime', mssql.DateTime, dto.deliveryStartTime ? new Date(dto.deliveryStartTime) : null);
      req1.input('DeliveryEndTime', mssql.DateTime, dto.deliveryEndTime ? new Date(dto.deliveryEndTime) : null);
      req1.input('CreatorUserID', mssql.Int, dto.userId);
      req1.input('ModifiedUserID', mssql.Int, dto.userId);
      req1.input('IsDeleted', mssql.Bit, 0);
      req1.input('InvoicePaymentMethodID', mssql.Int, dto.invoicePaymentMethodId);
      req1.input('OrderNumberCount', mssql.Int, 1);
      req1.input('AcceptAlternative', mssql.Bit, 0);
      req1.input('UserPromoCodeID', mssql.Int, dto.userPromoCodeId ?? null);
      req1.input('DiscountAmount', mssql.Numeric(18, 2), dto.discountAmount ?? 0);

      const insertOrderSql = `
        DECLARE @new TABLE (OrderID INT);
        INSERT INTO dbo.tbl_Orders (
          OrderNumber, OrderDate, UserID, AdditionalNotes, ContainFormula, UserLocationID,
          TotalOrderWithoutDeliveryFees, DeliveryFees, TotalOrder,
          DeliveryStartTime, DeliveryEndTime,
          CreatorUserID, CreationDate, ModifiedUserID, LastDateModified,
          IsDeleted, InvoicePaymentMethodID, OrderNumberCount, AcceptAlternative,
          UserPromoCodeID, DiscountAmount
        )
        OUTPUT INSERTED.OrderID INTO @new
        VALUES (
          @OrderNumber, @OrderDate, @UserID, @AdditionalNotes, @ContainFormula, @UserLocationID,
          @TotalOrderWithoutDeliveryFees, @DeliveryFees, @TotalOrder,
          @DeliveryStartTime, @DeliveryEndTime,
          @CreatorUserID, GETDATE(), @ModifiedUserID, GETDATE(),
          @IsDeleted, @InvoicePaymentMethodID, @OrderNumberCount, @AcceptAlternative,
          @UserPromoCodeID, @DiscountAmount
        );
        SELECT OrderID FROM @new;
      `;

      const r1 = await req1.query(insertOrderSql);
      const orderId: number | undefined = r1.recordset?.[0]?.OrderID;
      if (!orderId) {
        this.logger.error('[create] no OrderID returned after insert');
        throw new InternalServerErrorException('Failed to create order header');
      }
      this.logger.log(`[create] header OK → orderId=${orderId}`);

      // --- 2) INSERT items ---
      const insertItemSql = `
        INSERT INTO dbo.tbl_OrderItems
          (OrderID, MedicineID, Quantity, IsStrip, CreatorUserID, CreationDate,
           ModifiedUserID, LastDateModified, IsDeleted, Price, AlternativeMedicineID)
        VALUES
          (@OrderID, @MedicineID, @Quantity, @IsStrip, @CreatorUserID, GETDATE(),
           @ModifiedUserID, GETDATE(), 0, @Price, @AlternativeMedicineID);
      `;

      for (const it of dto.items) {
        const r2 = new mssql.Request(tx);
        r2.input('OrderID', mssql.Int, orderId);
        r2.input('MedicineID', mssql.Int, it.medicineId);
        r2.input('Quantity', mssql.Int, it.quantity);
        r2.input('IsStrip', mssql.Bit, it.isStrip ? 1 : 0);
        r2.input('CreatorUserID', mssql.Int, dto.userId);
        r2.input('ModifiedUserID', mssql.Int, dto.userId);
        r2.input('Price', mssql.Numeric(18, 2), it.price ?? 0);
        r2.input('AlternativeMedicineID', mssql.Int, it.alternativeMedicineId ?? null);
        await r2.query(insertItemSql);
        this.logger.debug(`[create] item added med=${it.medicineId} qty=${it.quantity} price=${it.price}`);
      }

      // (Optionnel) Forcer le recalcul si nécessaire (triggers le font déjà)
      // await new mssql.Request(tx).query(`EXEC dbo.cproc_tbl_Orders_ComputeOrderTotal ${orderId}`);

      await tx.commit();
      this.logger.log(`[create] OK → orderId=${orderId} number=${orderNumber}`);
      return { orderId, orderNumber };
    } catch (err: any) {
      try { await tx.rollback(); } catch (_) {}
      const info = {
        number: err?.number,
        state: err?.state,
        class: err?.class,
        lineNumber: err?.lineNumber,
        serverName: err?.serverName,
        message: err?.message,
      };
      this.logger.error(`[create] FAILED ${JSON.stringify(info)}`);
      throw new InternalServerErrorException('Internal server error');
    }
  }

async getOrderDetails(orderId: number, userId?: number) {
    this.logger.log(`[getOrderDetails] orderId=${orderId} user=${userId ?? '—'}`);

    // 1) Header
    const reqH = this.db.request();
    reqH.input('OrderID', Int, orderId);
    if (userId) reqH.input('UserID', Int, userId);

    const headerSql = `
      SELECT
        o.OrderID                          AS orderId,
        o.OrderNumber                      AS orderNumber,
        o.OrderDate                        AS orderDate,
        o.UserID                           AS userId,
        o.UserLocationID                   AS userLocationId,
        o.AdditionalNotes                  AS additionalNotes,
        o.DeliveryStartTime                AS deliveryStartTime,
        o.DeliveryEndTime                  AS deliveryEndTime,
        o.InvoicePaymentMethodID           AS paymentMethodId,
        pm.NameEn                          AS paymentMethodNameEn,
        pm.NameAr                          AS paymentMethodNameAr,
        o.TotalOrderWithoutDeliveryFees    AS subTotal,
        o.DeliveryFees                     AS deliveryFees,
        o.DiscountAmount                   AS discountAmount,
        o.TotalOrder                       AS total,

        ul.LabelName                       AS addressTitle,
        ul.Address                         AS address,
        ul.CountryName                     AS countryName,
        ul.GovernorateName                 AS governorateName,
        ul.DistrictID                      AS districtId
      FROM dbo.tbl_Orders o
      LEFT JOIN dbo.lkp_InvoicePaymentMethods pm
        ON pm.InvoicePaymentMethodID = o.InvoicePaymentMethodID
      LEFT JOIN dbo.tbl_UserLocations ul
        ON ul.UserLocationID = o.UserLocationID
      WHERE o.OrderID = @OrderID
        AND (o.IsDeleted = 0 OR o.IsDeleted IS NULL)
        ${userId ? 'AND o.UserID = @UserID' : ''}
    `;

    const h = await reqH.query(headerSql);
    const header = h.recordset?.[0];
    if (!header) {
      return { success: false, message: 'ORDER_NOT_FOUND' };
    }

    // 2) Items
    const reqI = this.db.request();
    reqI.input('OrderID', Int, orderId);
    const itemsSql = `
      SELECT
        oi.OrderItemID       AS orderItemId,
        oi.MedicineID        AS medicineId,
        m.NameEn             AS nameEn,        -- ajuste si ton schéma diffère
        m.NameAr             AS nameAr,        -- idem
        oi.Quantity          AS quantity,
        oi.Price             AS price,
        (oi.Price * oi.Quantity) AS lineTotal,
        oi.IsStrip           AS isStrip
      FROM dbo.tbl_OrderItems oi
      LEFT JOIN dbo.lkp_Medicines m ON m.MedicineID = oi.MedicineID
      WHERE oi.OrderID = @OrderID
        AND (oi.IsDeleted = 0 OR oi.IsDeleted IS NULL)
      ORDER BY oi.OrderItemID ASC
    `;
    const i = await reqI.query(itemsSql);

    return {
      success: true,
      order: header,
      items: i.recordset ?? [],
      totals: {
        subTotal: header.subTotal ?? 0,
        deliveryFees: header.deliveryFees ?? 0,
        discountAmount: header.discountAmount ?? 0,
        total: header.total ?? 0,
      },
    };
  }

  async listByUser(userId: number, page = 1, pageSize = 20) {
    const t0 = Date.now();
    const skip = (page - 1) * pageSize;

    // 1) total rows
    const countSql = `
      SELECT COUNT(*) AS total
      FROM dbo.tbl_Orders o
      WHERE o.UserID = @UserId
        AND (o.IsDeleted = 0 OR o.IsDeleted IS NULL)
    `;
    const cReq = this.db.request();
    cReq.input('UserId', mssql.Int, userId);
    const cRes = await cReq.query(countSql);
    const totalRows: number = cRes.recordset?.[0]?.total ?? 0;

    // 2) page data
    const dataSql = `
      ;WITH H AS (
        SELECT
          o.OrderID                    AS orderId,
          o.OrderNumber                AS orderNumber,
          o.OrderDate                  AS orderDate,
          o.UserLocationID             AS userLocationId,
          o.InvoicePaymentMethodID     AS paymentMethodId,
          o.TotalOrderWithoutDeliveryFees AS subTotal,
          o.DeliveryFees               AS deliveryFees,
          o.DiscountAmount             AS discountAmount,
          o.TotalOrder                 AS total,
          ul.LabelName                 AS addressTitle,
          ul.Address                   AS address,
          ul.GovernorateName           AS governorateName,
          ul.CountryName               AS countryName
        FROM dbo.tbl_Orders o
        LEFT JOIN dbo.tbl_UserLocations ul ON ul.UserLocationID = o.UserLocationID
        WHERE o.UserID = @UserId
          AND (o.IsDeleted = 0 OR o.IsDeleted IS NULL)
      )
      SELECT
        H.*,
        COUNT(oi.OrderItemID)           AS itemsCount,
        SUM(COALESCE(oi.Quantity,0))    AS units
      FROM H
      LEFT JOIN dbo.tbl_OrderItems oi ON oi.OrderID = H.orderId
      GROUP BY
        H.orderId, H.orderNumber, H.orderDate, H.userLocationId, H.paymentMethodId,
        H.subTotal, H.deliveryFees, H.discountAmount, H.total,
        H.addressTitle, H.address, H.governorateName, H.countryName
      ORDER BY H.orderDate DESC
      OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY;
    `;

    const dReq = this.db.request();
    dReq.input('UserId', mssql.Int, userId);
    dReq.input('Skip', mssql.Int, skip);
    dReq.input('Take', mssql.Int, pageSize);
    const dRes = await dReq.query(dataSql);
    const items = dRes.recordset ?? [];

    this.logger.log(`[listForUser] uid=${userId} page=${page} size=${pageSize} rows=${items.length}/${totalRows} took=${Date.now()-t0}ms`);

    return {
      page,
      pageSize,
      totalRows,
      items, // chaque item contient: orderId, orderNumber, orderDate, subTotal, deliveryFees, discountAmount, total, itemsCount, units, addressTitle, address, governorateName, countryName
    };
  }

}
