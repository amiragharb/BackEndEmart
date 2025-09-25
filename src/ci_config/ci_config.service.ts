import { Inject, Injectable } from '@nestjs/common';
import { CreateCiConfigDto } from './dto/create-ci_config.dto';
import { UpdateCiConfigDto } from './dto/update-ci_config.dto';
import * as sql from 'mssql';

@Injectable()
export class CiConfigService {
  constructor(    @Inject('MSSQL_SETTINGS_CONNECTION') private readonly db: sql.ConnectionPool,
) {}

  async getConfig() {
    const sql = `
     select 
    primclr.ItemValue CIPrimaryColor,
    secclr.ItemValue CISecondaryColor,
    CIClientName1.ItemValue CIClientName,
    CILogo1.ItemValue CILogo,
    CIShowBrands1.ItemValue CIShowBrands,
    CIShowTopSeller1.ItemValue CIShowTopSeller,
    CIShowCategories1.ItemValue CIShowCategories,
    CIEnableGoogleLogin1.ItemValue CIEnableGoogleLogin,
    CIEnableFacebookLogin1.ItemValue CIEnableFacebookLogin,
    CIEnableAppleLogin1.ItemValue CIEnableAppleLogin,
    CIDefaultLanguage1.ItemValue CIDefaultLanguage
from tbl_Settings primclr
left outer join tbl_Settings secclr on (secclr.ItemName='CISecondaryColor')
left outer join tbl_Settings CIClientName1 on (CIClientName1.ItemName='CIClientName')
left outer join tbl_Settings CILogo1 on (CILogo1.ItemName='CILogo')
left outer join tbl_Settings CIShowBrands1 on (CIShowBrands1.ItemName='CIShowBrands')
left outer join tbl_Settings CIShowTopSeller1 on (CIShowTopSeller1.ItemName='CIShowTopSeller')
left outer join tbl_Settings CIShowCategories1 on (CIShowCategories1.ItemName='CIShowCategories')
left outer join tbl_Settings CIEnableGoogleLogin1 on (CIEnableGoogleLogin1.ItemName='CIEnableGoogleLogin')
left outer join tbl_Settings CIEnableFacebookLogin1 on (CIEnableFacebookLogin1.ItemName='CIEnableFacebookLogin')
left outer join tbl_Settings CIEnableAppleLogin1 on (CIEnableAppleLogin1.ItemName='CIEnableAppleLogin')
left outer join tbl_Settings CIDefaultLanguage1 on (CIDefaultLanguage1.ItemName='CIDefaultLanguage')
where primclr.ItemName='CIPrimaryColor';

    `;

    const result = await this.db.query(sql);
const row = result.recordset[0] || {};

return {
  CIPrimaryColor: row.CIPrimaryColor,
  CISecondaryColor: row.CISecondaryColor,
  CIClientName: row.CIClientName,
  CILogo: row.CILogo,
  CIShowBrands: row.CIShowBrands === '1' || row.CIShowBrands === 'true',
  CIShowTopSeller: row.CIShowTopSeller === '1' || row.CIShowTopSeller === 'true',
  CIShowCategories: row.CIShowCategories === '1' || row.CIShowCategories === 'true',
  CIEnableGoogleLogin: row.CIEnableGoogleLogin === '1' || row.CIEnableGoogleLogin === 'true',
  CIEnableFacebookLogin: row.CIEnableFacebookLogin === '1' || row.CIEnableFacebookLogin === 'true',
  CIEnableAppleLogin: row.CIEnableAppleLogin === '1' || row.CIEnableAppleLogin === 'true',
  CIDefaultLanguage: row.CIDefaultLanguage,
};

  }
}
