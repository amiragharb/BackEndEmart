import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString,
  Min, ValidateNested
} from 'class-validator';

export class CreateOrderItemDto {
  @IsInt() medicineId: number;          // => dbo.tbl_OrderItems.MedicineID
  @IsInt() @Min(1) quantity: number;    // => dbo.tbl_OrderItems.Quantity
  @IsNumber() price: number;            // => dbo.tbl_OrderItems.Price
  @IsOptional() @IsBoolean() isStrip?: boolean;               // default 0
  @IsOptional() @IsInt() alternativeMedicineId?: number;      // nullable
}

export class CreateOrderDto {
  @IsInt() userId: number;              // => dbo.tbl_Orders.UserID
  @IsInt() userLocationId: number;      // => dbo.tbl_Orders.UserLocationID
  @IsInt() invoicePaymentMethodId: number; // 1=COD, 2=CARD

  @IsOptional() @IsString() additionalNotes?: string;
  @IsOptional() @IsDateString() deliveryStartTime?: string;
  @IsOptional() @IsDateString() deliveryEndTime?: string;

  @IsOptional() @IsNumber() discountAmount?: number; // dbo.tbl_Orders.DiscountAmount
  @IsOptional() @IsInt() userPromoCodeId?: number;   // dbo.tbl_Orders.UserPromoCodeID
  @IsOptional() @IsNumber() deliveryFees?: number;   // dbo.tbl_Orders.DeliveryFees
  @IsOptional() @IsNumber() total?: number;          // Total « à plat » envoyé par l’app

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
