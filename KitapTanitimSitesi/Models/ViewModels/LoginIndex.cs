using System.ComponentModel.DataAnnotations;

namespace KitapTanitimSitesi.Models.ViewModels
{
    public class LoginIndex
    {
        [Required(ErrorMessage = "Kullanıcı adı veya e-posta gerekli.")]
        public string UsernameOrEmail { get; set; }

        [Required(ErrorMessage = "Şifre gerekli.")]
        [DataType(DataType.Password)]
        public string Password { get; set; }
    }
}