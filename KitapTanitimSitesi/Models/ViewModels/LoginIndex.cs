using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models.ViewModels
{
    public class LoginIndex
    {
        [Required(ErrorMessage = "Kullanıcı adı veya e-posta gerekli.")]
        [Display(Name = "Kullanıcı Adı ya da E-posta")]
        public string UsernameOrEmail { get; set; }

        [Required(ErrorMessage = "Şifre gerekli.")]
        [DataType(DataType.Password)]
        [Display(Name = "Şifre")]
        public string Password { get; set; }
    }
}